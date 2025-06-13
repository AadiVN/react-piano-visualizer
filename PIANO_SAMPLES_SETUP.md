# Piano Samples Setup Guide

This guide will help you set up realistic piano sounds using the Salamander Grand Piano samples from the sfzinstruments repository.

## Quick Setup

### Option 1: Download Pre-converted Samples (Recommended)

1. Create a `public/piano-samples/` directory in your project root
2. Download the converted WAV/FLAC samples from one of these sources:
   - [Salamander Piano Samples (Web-ready)](https://archive.org/details/SalamanderGrandPianoV3)
   - [Piano samples in various formats](https://freepats.zenvoid.org/Piano/)

### Option 2: Convert from Original Salamander Repository

1. **Download the original Salamander Grand Piano:**

   ```bash
   git clone https://github.com/sfzinstruments/SalamanderGrandPiano.git
   ```

2. **Extract the samples:** The samples are located in the `Samples/` directory as FLAC files.

3. **Convert to web-compatible format:**
   - You'll need to extract individual note samples from the SFZ format
   - Convert FLAC to WAV/MP3 for better web compatibility
   - Use tools like FFmpeg for conversion:
   ```bash
   ffmpeg -i input.flac -acodec pcm_s16le output.wav
   ```

## File Structure

Place the piano samples in your `public` directory like this:

```
public/
└── piano-samples/
    ├── A0.flac     # or .wav/.mp3
    ├── C1.flac
    ├── D#1.flac
    ├── F#1.flac
    ├── A1.flac
    ├── C2.flac
    ├── D#2.flac
    ├── F#2.flac
    ├── A2.flac
    ├── C3.flac
    ├── D#3.flac
    ├── F#3.flac
    ├── A3.flac
    ├── C4.flac     # Middle C
    ├── D#4.flac
    ├── F#4.flac
    ├── A4.flac     # 440Hz reference
    ├── C5.flac
    ├── D#5.flac
    ├── F#5.flac
    ├── A5.flac
    ├── C6.flac
    ├── D#6.flac
    ├── F#6.flac
    ├── A6.flac
    ├── C7.flac
    ├── D#7.flac
    ├── F#7.flac
    ├── A7.flac
    └── C8.flac
```

## Supported Sample Formats

The piano visualizer supports:

- **FLAC** (best quality, larger files)
- **WAV** (good quality, large files)
- **MP3** (compressed, smaller files)

## How It Works

1. **Sample Mapping:** The application maps each of the 88 piano keys to the nearest available sample
2. **Pitch Shifting:** Uses Web Audio API's `playbackRate` to adjust sample pitch for keys between samples
3. **Fallback:** If samples aren't available, falls back to the original oscillator-based sound

## Velocity Layers (Advanced)

For more realistic sound, you can add multiple velocity layers:

```
public/
└── piano-samples/
    ├── velocity-low/
    │   ├── A0.flac
    │   └── C1.flac
    ├── velocity-medium/
    │   ├── A0.flac
    │   └── C1.flac
    └── velocity-high/
        ├── A0.flac
        └── C1.flac
```

To use velocity layers, modify the `getPianoSampleUrl` function in `PianoVisualizer.jsx` to select samples based on velocity.

## Performance Considerations

- **File Size:** Piano samples can be large (10-50MB total). Consider using compressed formats for web deployment
- **Loading:** Samples are loaded on-demand, which may cause slight delay for first play
- **Caching:** Browser will cache loaded samples for better performance on subsequent plays

## License

The Salamander Grand Piano samples are licensed under Creative Commons Attribution 3.0 Unported License. Make sure to include proper attribution if you distribute your app:

> Piano samples from Salamander Grand Piano v3 by Alexander Holm, licensed under CC BY 3.0
> Source: https://github.com/sfzinstruments/SalamanderGrandPiano

## Troubleshooting

**Samples not loading?**

- Check browser console for network errors
- Verify file paths and names match exactly
- Ensure files are in the `public/piano-samples/` directory
- Test with a simple sample first (e.g., just C4.flac)

**Poor sound quality?**

- Try higher quality samples (24-bit FLAC)
- Reduce pitch shifting range by adding more sample points
- Add velocity layers for more realistic dynamics

**Large file sizes?**

- Use compressed formats (MP3 at 192kbps)
- Reduce sample count (every major third instead of minor third)
- Implement progressive loading for better UX
