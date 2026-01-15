import { NextRequest, NextResponse } from 'next/server';

const EXE_PATH = 'C:\\Users\\Anwender\\flutter\\flutter_windows_app\\trainer_flutter\\build\\windows\\x64\\runner\\Release\\trainer_flutter.exe';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool } = body;

    if (!tool) {
      return NextResponse.json(
        { error: 'Tool ID is required' },
        { status: 400 }
      );
    }

    // Validate tool ID
    const validTools = ['farben', 'kettenrechner', 'timers', 'intervall', 'sound-counter', 'motion-counter'];
    if (!validTools.includes(tool)) {
      return NextResponse.json(
        { error: 'Invalid tool ID' },
        { status: 400 }
      );
    }

    // Launch the Flutter Windows app
    const { spawn } = await import('child_process');

    // For Windows, we need to spawn the process
    const childProcess = spawn(
      'cmd.exe',
      ['/c', `start "" "${EXE_PATH}"`],
      {
        detached: true,
        stdio: 'ignore',
        shell: true,
      }
    );

    childProcess.unref();

    return NextResponse.json({
      success: true,
      tool,
      message: `Launched ${tool} training tool`,
      path: EXE_PATH,
    });
  } catch (error) {
    console.error('Failed to launch training tool:', error);
    return NextResponse.json(
      {
        error: 'Failed to launch application',
        details: error instanceof Error ? error.message : 'Unknown error',
        fallback: `Please run: ${EXE_PATH}`,
      },
      { status: 500 }
    );
  }
}
