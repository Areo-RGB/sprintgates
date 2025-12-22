export interface TransportConfig {
    onEvent: (topic: string, data: any) => void;
    onStatusChange: (isConnected: boolean) => void;
}

export interface Transport {
    connect(config: TransportConfig): Promise<void>;
    disconnect(): void;
    publish(topic: string, data: any): Promise<void>;
    now(): number; // Returns current synchronized time
    getServerTime(): Promise<number>; // For calibration/RTT calculation
    setOffset(offset: number): void;
}
