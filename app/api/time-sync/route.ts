'use server';

import { NextResponse } from 'next/server';

/**
 * Server-Side Timestamp API
 * 
 * Returns the server's current timestamp along with the client's sent timestamp.
 * This allows accurate calculation of one-way latency (asymmetric network correction).
 * 
 * Usage:
 * 1. Client sends request with `clientTime` (performance.now())
 * 2. Server responds with `serverTime` (Date.now()) and echoes `clientTime`
 * 3. Client calculates:
 *    - Upload latency = serverTime - clientTime (after clock offset correction)
 *    - Download latency = RTT - uploadLatency
 */
export async function GET(request: Request) {
  const serverTime = Date.now();
  
  // Extract client timestamp from query params
  const { searchParams } = new URL(request.url);
  const clientTime = searchParams.get('t');
  
  return NextResponse.json({
    serverTime,
    clientTime: clientTime ? parseFloat(clientTime) : null,
    // Include server processing overhead (should be < 1ms)
    serverProcessingStart: serverTime,
  });
}

export async function POST(request: Request) {
  const serverReceiveTime = Date.now();
  
  try {
    const body = await request.json();
    const clientSendTime = body.clientSendTime;
    
    const serverResponseTime = Date.now();
    
    return NextResponse.json({
      serverReceiveTime,      // When server received the request
      serverResponseTime,     // When server is sending response
      clientSendTime,         // Echo back client's send time
      serverProcessing: serverResponseTime - serverReceiveTime, // Server overhead
    });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
