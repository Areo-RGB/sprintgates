import { Peer, DataConnection } from 'peerjs';
import { Transport, TransportConfig } from './Transport';

const HOST_PEER_ID = 'sprint-gates-host';

interface PeerMessage {
    type: 'EVENT' | 'TIME_REQ' | 'TIME_RESP';
    topic?: string;
    data?: any;
    reqId?: string;
    serverTime?: number;
}

export class PeerTransport implements Transport {
    private peer: Peer | null = null;
    private connections: DataConnection[] = []; // For Host: all clients. For Client: valid connection to Host.
    private hostConnection: DataConnection | null = null;
    private config: TransportConfig | null = null;
    private isHost: boolean = false;
    private offset: number = 0;

    // Request/Response handling
    private pendingRequests: Map<string, (time: number) => void> = new Map();

    constructor() { }

    async connect(config: TransportConfig): Promise<void> {
        this.config = config;

        // 1. Try to become Host
        try {
            await this.initPeer(HOST_PEER_ID);
            this.isHost = true;
            console.log('Initialized as Host:', HOST_PEER_ID);
        } catch (e: any) {
            if (e.type === 'unavailable-id') {
                // ID taken, so we become a Client
                console.log('Host ID taken, initializing as Client');
                await this.initPeer(); // Random ID
                this.isHost = false;
                this.connectToHost();
            } else {
                console.error('Peer init error:', e);
                return;
            }
        }
    }

    private initPeer(id?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const peer = id ? new Peer(id, {
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            }) : new Peer({
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });

            peer.on('open', () => {
                this.peer = peer;
                resolve();
            });

            peer.on('error', (err) => {
                reject(err);
            });

            peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });
        });
    }

    private connectToHost() {
        if (!this.peer) return;
        const conn = this.peer.connect(HOST_PEER_ID);
        this.handleIncomingConnection(conn);
        this.hostConnection = conn;
    }

    private handleIncomingConnection(conn: DataConnection) {
        conn.on('open', () => {
            console.log('Connection opened:', conn.peer);
            this.connections.push(conn);

            if (this.isHost || conn.peer === HOST_PEER_ID) {
                this.config?.onStatusChange(true);
                if (!this.isHost) {
                    this.performStartupSync();
                }
            }
        });

        conn.on('data', (data: any) => {
            this.handleMessage(conn, data as PeerMessage);
        });

        conn.on('close', () => {
            console.log('Connection closed:', conn.peer);
            this.connections = this.connections.filter(c => c !== conn);
            if (conn.peer === HOST_PEER_ID) {
                this.config?.onStatusChange(false);
            }
        });
    }

    private handleMessage(conn: DataConnection, msg: PeerMessage) {
        if (msg.type === 'EVENT') {
            if (msg.topic && msg.data) {
                this.config?.onEvent(msg.topic, msg.data);

                // If I am Host, broadcast to others (and echo back to sender if needed? Ably echoes).
                // Ably echoes. So broadcast to ALL connections including sender.
                if (this.isHost) {
                    this.broadcast(msg);
                }
            }
        } else if (msg.type === 'TIME_REQ') {
            // Only Host responds to time req
            if (this.isHost && msg.reqId) {
                const resp: PeerMessage = {
                    type: 'TIME_RESP',
                    reqId: msg.reqId,
                    serverTime: Date.now()
                };
                conn.send(resp);
            }
        } else if (msg.type === 'TIME_RESP') {
            if (msg.reqId && this.pendingRequests.has(msg.reqId)) {
                this.pendingRequests.get(msg.reqId)!(msg.serverTime || 0);
                this.pendingRequests.delete(msg.reqId);
            }
        }
    }

    private broadcast(msg: PeerMessage) {
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(msg);
            }
        });
    }

    async publish(topic: string, data: any): Promise<void> {
        const msg: PeerMessage = { type: 'EVENT', topic, data };

        if (this.isHost) {
            // Local event
            this.config?.onEvent(topic, data);
            // Broadcast
            this.broadcast(msg);
        } else {
            // Send to Host
            if (this.hostConnection?.open) {
                this.hostConnection.send(msg);
            }
        }
    }

    private async performStartupSync() {
        let totalOffset = 0;
        const burstCount = 5;

        for (let i = 0; i < burstCount; i++) {
            const start = performance.now();
            const serverTime = await this.getServerTime();
            const end = performance.now();

            const latency = (end - start) / 2;
            const predictedServerTime = serverTime + latency;
            const currentOffset = predictedServerTime - end;

            totalOffset += currentOffset;
            await new Promise((r) => setTimeout(r, 100));
        }

        this.offset = totalOffset / burstCount;
        console.log('Peer Transport Sync complete, offset:', this.offset);
    }

    disconnect(): void {
        this.peer?.destroy();
        this.config?.onStatusChange(false);
    }

    now(): number {
        return performance.now() + this.offset;
    }

    getServerTime(): Promise<number> {
        if (this.isHost) {
            return Promise.resolve(Date.now());
        }

        return new Promise((resolve) => {
            const reqId = Math.random().toString(36).substring(7);
            this.pendingRequests.set(reqId, resolve);

            if (this.hostConnection?.open) {
                this.hostConnection.send({ type: 'TIME_REQ', reqId });
            } else {
                // Return local time if no connection, better than hanging
                resolve(Date.now());
            }

            // Timeout safety
            setTimeout(() => {
                if (this.pendingRequests.has(reqId)) {
                    this.pendingRequests.delete(reqId);
                    resolve(Date.now());
                }
            }, 2000);
        });
    }

    setOffset(offset: number): void {
        this.offset = offset;
    }
}
