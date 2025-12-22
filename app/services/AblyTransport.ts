import Ably from 'ably';
import { Transport, TransportConfig } from './Transport';

export class AblyTransport implements Transport {
    private ably: Ably.Realtime | null = null;
    private channel: Ably.RealtimeChannel | null = null;
    private offset: number = 0;
    private config: TransportConfig | null = null;
    private channelName = 'my-private-sprint-track';

    constructor() { }

    async connect(config: TransportConfig): Promise<void> {
        this.config = config;

        if (!process.env.NEXT_PUBLIC_ABLY_KEY) {
            console.error('Ably API Key is missing!');
            return;
        }

        this.ably = new Ably.Realtime({
            key: process.env.NEXT_PUBLIC_ABLY_KEY,
            autoConnect: true,
        });

        this.ably.connection.on('connected', () => {
            console.log('Connected to Ably!');
            config.onStatusChange(true);
            this.performStartupSync();
        });

        this.ably.connection.on('disconnected', () => {
            config.onStatusChange(false);
        });

        this.channel = this.ably.channels.get(this.channelName);

        this.channel.subscribe((message) => {
            config.onEvent(message.name || '', message.data);
        });
    }

    private async performStartupSync() {
        if (!this.ably) return;

        let totalOffset = 0;
        const burstCount = 5;

        for (let i = 0; i < burstCount; i++) {
            const start = performance.now();
            const serverTime = await this.ably.time();
            const end = performance.now();

            const latency = (end - start) / 2;
            const predictedServerTime = serverTime + latency;
            const currentOffset = predictedServerTime - end;

            totalOffset += currentOffset;
            await new Promise((r) => setTimeout(r, 100));
        }

        this.offset = totalOffset / burstCount;
        console.log('Ably Transport Sync complete, offset:', this.offset);
    }

    disconnect(): void {
        if (this.channel) {
            this.channel.unsubscribe();
        }
        if (this.ably) {
            this.ably.close();
        }
        this.config?.onStatusChange(false);
    }

    async publish(topic: string, data: any): Promise<void> {
        if (!this.channel) return;
        await this.channel.publish(topic, data);
    }

    now(): number {
        return performance.now() + this.offset;
    }

    async getServerTime(): Promise<number> {
        if (!this.ably) return Date.now();
        return this.ably.time();
    }

    setOffset(offset: number): void {
        this.offset = offset;
    }
}
