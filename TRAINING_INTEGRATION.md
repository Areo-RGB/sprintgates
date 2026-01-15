# Training Tools Integration

## Overview

The Sprint Gates application now includes integration with the Flutter Windows native training application (`trainer_flutter`). This allows athletes to access cognitive and physical training tools directly from the sprint timing interface.

## Features

### Integrated Training Tools

| Tool | Description | Use Case |
|-------|-------------|-----------|
| **Farben** | Stroop effect cognitive trainer | Improves reaction time and color-word interference processing |
| **Kettenrechner** | Mental math chain calculator | Enhances quick calculation and focus under pressure |
| **Timers** | Interval timers and loop presets | Custom workout intervals and training sessions |
| **Intervall** | Custom audio beep intervals | Auditory training and timing exercises |
| **Sound Counter** | Microphone sound detection | Count audio events (claps, beeps, etc.) |
| **Motion Counter** | Camera-based motion detection | Count movements crossing virtual tripwire |

## Architecture

### Frontend Integration

**Component:** `app/components/TrainingToolsLauncher.tsx`

- Displays training tool grid in modal
- Handles tool selection and launch requests
- Provides visual feedback during launch
- Shows fallback instructions if API unavailable

### Backend Integration

**API Route:** `app/api/launch-training/route.ts`

- Receives launch requests from frontend
- Spawns native Windows process (detached)
- Validates tool IDs
- Returns success/error responses

### Application Paths

**Flutter Windows App:**
```
C:\Users\Anwender\flutter\flutter_windows_app\trainer_flutter\build\windows\x64\runner\Release\trainer_flutter.exe
```

**Desktop Shortcut:**
```
C:\Users\Anwender\Desktop\Trainer Flutter.lnk
```

## Usage

### From Sprint Gates UI

1. Open Sprint Gates application
2. Click the **"Training"** button in the top toolbar (🏋️ icon)
3. Select desired training tool from the grid
4. Tool launches automatically in separate window

### Manual Launch

**Via Desktop Shortcut:**
- Double-click "Trainer Flutter" shortcut on desktop

**Via Command Line:**
```powershell
& "C:\Users\Anwender\flutter\flutter_windows_app\trainer_flutter\build\windows\x64\runner\Release\trainer_flutter.exe"
```

## Technical Details

### API Endpoint

**POST** `/api/launch-training`

**Request Body:**
```json
{
  "tool": "farben" | "kettenrechner" | "timers" | "intervall" | "sound-counter" | "motion-counter"
}
```

**Response:**
```json
{
  "success": true,
  "tool": "farben",
  "message": "Launched farben training tool",
  "path": "C:\\Users\\Anwender\\..."
}
```

### Process Launching

The Next.js API uses `child_process.spawn` to launch the Flutter app:
- **Detached process:** Doesn't block the API server
- **Windows CMD:** Uses `cmd.exe /c start ""` to launch in new window
- **Ignored stdio:** Prevents hanging on output
- **Unref:** Allows Node process to exit without waiting for child

## Development

### Updating the Integration

**To modify the launcher UI:**
Edit `app/components/TrainingToolsLauncher.tsx`

**To change launch behavior:**
Edit `app/api/launch-training/route.ts`

**To add new training tools:**
1. Add tool configuration to `trainingTools` array in `TrainingToolsLauncher.tsx`
2. Update validation in `route.ts`
3. Ensure Flutter app supports the new tool

### Troubleshooting

**Launch fails from UI:**
- Check if Flutter app executable exists at the path
- Verify Windows permissions allow process spawning
- Try launching manually via desktop shortcut

**API errors:**
- Check Next.js server logs for spawn errors
- Ensure `child_process` is available in environment
- Verify path formatting (double backslashes for Windows)

**Tool doesn't appear:**
- Verify tool ID matches valid tools list
- Check Flutter app router configuration
- Ensure screen is exported and registered

## Future Enhancements

- [ ] Add training tool selection to sprint gate configuration
- [ ] Sync training tool sessions with sprint data
- [ ] Add training progress tracking and analytics
- [ ] Create custom training sequences for sprint-specific workouts
- [ ] Integrate camera input from sprint gates for motion counter

## Related Projects

- **Sprint Gates:** Real-time sprint timing system
- **Trainer Flutter:** Windows native training application
- **GitHub:** https://github.com/Areo-RGB/trainer_flutter_windows

---

*Last Updated: December 2025*
