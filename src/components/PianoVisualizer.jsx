import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Play, Square, Download, RotateCcw, Volume2, Usb } from "lucide-react";

// MIDI note mapping for 88 keys (A0 to C8)
const generateKeyMapping = () => {
  const keys = [];
  const noteNames = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];

  // Start from A0 (MIDI note 21)
  let midiNote = 21;
  let octave = 0;
  let noteIndex = 9; // Start with A

  for (let i = 0; i < 88; i++) {
    const noteName = noteNames[noteIndex];
    const isBlack = noteName.includes("#");

    keys.push({
      id: i,
      note: `${noteName}${octave}`,
      midiNote: midiNote,
      isBlack: isBlack,
      frequency: 440 * Math.pow(2, (midiNote - 69) / 12),
    });

    midiNote++;
    noteIndex++;

    if (noteIndex >= 12) {
      noteIndex = 0;
      octave++;
    }
  }

  return keys;
};

// Simple MIDI file generator
const generateMIDIFile = (notes) => {
  const ticksPerQuarter = 480;
  const header = new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01,
    0x01, 0xe0,
  ]);

  const events = [];
  notes.forEach((note) => {
    const startTime = Math.round((note.startTime * ticksPerQuarter) / 1000);
    const duration = Math.round((note.duration * ticksPerQuarter) / 1000);

    events.push({
      time: startTime,
      data: [0x90, note.midiNote, note.velocity || 64],
    });

    events.push({
      time: startTime + duration,
      data: [0x80, note.midiNote, 0],
    });
  });

  events.sort((a, b) => a.time - b.time);

  const trackData = [];
  let currentTime = 0;

  events.forEach((event) => {
    const deltaTime = event.time - currentTime;
    trackData.push(...encodeVariableLength(deltaTime));
    trackData.push(...event.data);
    currentTime = event.time;
  });

  trackData.push(0x00, 0xff, 0x2f, 0x00);

  const trackHeader = new Uint8Array([
    0x4d,
    0x54,
    0x72,
    0x6b,
    (trackData.length >> 24) & 0xff,
    (trackData.length >> 16) & 0xff,
    (trackData.length >> 8) & 0xff,
    trackData.length & 0xff,
  ]);

  const midiFile = new Uint8Array(
    header.length + trackHeader.length + trackData.length
  );
  midiFile.set(header, 0);
  midiFile.set(trackHeader, header.length);
  midiFile.set(trackData, header.length + trackHeader.length);

  return midiFile;
};

const encodeVariableLength = (value) => {
  const bytes = [];
  bytes.push(value & 0x7f);
  value >>= 7;

  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }

  return bytes;
};

const PianoVisualizer = () => {
  const [keys] = useState(generateKeyMapping());
  const [pressedKeys, setPressedKeys] = useState(new Set());
  const [isRecording, setIsRecording] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [recordedNotes, setRecordedNotes] = useState([]);
  const [activeNotes, setActiveNotes] = useState(new Map());
  const [midiAccess, setMidiAccess] = useState(null);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [keyWidth, setKeyWidth] = useState(12);
  const [visualNotes, setVisualNotes] = useState([]);
  const [sampleStatus, setSampleStatus] = useState("checking"); // 'checking', 'loaded', 'fallback'
  const [usePianoSamples, setUsePianoSamples] = useState(true); // Toggle for piano samples vs oscillator
  const [soundEnabled, setSoundEnabled] = useState(true); // Toggle for sound on/off
  const [performanceMode, setPerformanceMode] = useState(false); // Performance mode toggle
  const audioContextRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const replayTimeoutRefs = useRef([]);
  const containerRef = useRef(null);
  const pianoRef = useRef(null);
  const noteIdCounter = useRef(0);
  const animationFrameRef = useRef(null);
  const audioBufferCache = useRef(new Map()); // Cache for loaded audio buffers
  const lastKeyPressTime = useRef(new Map()); // Throttle key presses

  // Memoized white keys to avoid filtering on every render
  const whiteKeys = useMemo(() => keys.filter((key) => !key.isBlack), [keys]);

  // Calculate responsive key width
  useEffect(() => {
    const updateKeyWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth - 48;
        const whiteKeyCount = keys.filter((key) => !key.isBlack).length;
        const calculatedWidth = Math.max(
          8,
          Math.floor(containerWidth / whiteKeyCount)
        );
        setKeyWidth(Math.min(calculatedWidth, 20));
      }
    };

    updateKeyWidth();
    window.addEventListener("resize", updateKeyWidth);
    return () => window.removeEventListener("resize", updateKeyWidth);
  }, [keys]);

  // Initialize Web Audio API
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext ||
      window.webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []); // Optimized animation loop with throttled cleanup
  useEffect(() => {
    let lastCleanupTime = 0;
    const cleanupInterval = 1000; // Only cleanup every 1 second instead of every frame

    const animationLoop = (currentTime) => {
      // Only perform cleanup periodically to reduce CPU usage
      if (currentTime - lastCleanupTime > cleanupInterval) {
        setVisualNotes((prevNotes) => {
          return prevNotes.filter((note) => {
            const elapsed = currentTime - note.startTime;
            const animationDuration = 3500; // 3.5 seconds total (3s slide + 0.5s buffer)

            // Remove notes that have completed their animation
            if (note.duration && elapsed > animationDuration) {
              return false;
            }

            return true;
          });
        });
        lastCleanupTime = currentTime;
      }

      animationFrameRef.current = requestAnimationFrame(animationLoop);
    };

    animationFrameRef.current = requestAnimationFrame(animationLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Initialize MIDI
  useEffect(() => {
    const initMIDI = async () => {
      try {
        const access = await navigator.requestMIDIAccess();
        setMidiAccess(access);

        const devices = [];
        for (const input of access.inputs.values()) {
          devices.push(input);
        }
        setConnectedDevices(devices);
      } catch (error) {
        console.log("MIDI access denied or not supported:", error);
      }
    };

    initMIDI();
  }, []); // Get piano sample URL for a given MIDI note with velocity layer support
  const getPianoSampleUrl = useCallback((midiNote, velocity = 64) => {
    const sampleFormat = "flac";

    // Map velocity (0-127) to sample layers (1-16)
    // Lower velocities use softer samples, higher velocities use harder samples
    const velocityLayer = Math.max(
      1,
      Math.min(16, Math.ceil((velocity / 127) * 16))
    );

    // Available sample notes in your collection
    // A notes: A0-A7 (MIDI notes 21, 33, 45, 57, 69, 81, 93, 105)
    const aNotes = [21, 33, 45, 57, 69, 81, 93, 105];

    // D# notes: D#1-D#7 (MIDI notes 27, 39, 51, 63, 75, 87, 99)
    const dsNotes = [27, 39, 51, 63, 75, 87, 99];

    // F# notes: F#1-F#7 (MIDI notes 30, 42, 54, 66, 78, 90, 102)
    const fsNotes = [30, 42, 54, 66, 78, 90, 102];

    // C notes: C1-C8 (MIDI notes 24, 36, 48, 60, 72, 84, 96, 108)
    const cNotes = [24, 36, 48, 60, 72, 84, 96, 108];

    // Combine all available sample points and sort
    const allAvailableNotes = [
      ...aNotes,
      ...dsNotes,
      ...fsNotes,
      ...cNotes,
    ].sort((a, b) => a - b);

    // Find the closest available sample
    let closestNote = allAvailableNotes[0];
    let minDistance = Math.abs(midiNote - closestNote);

    for (const note of allAvailableNotes) {
      const distance = Math.abs(midiNote - note);
      if (distance < minDistance) {
        minDistance = distance;
        closestNote = note;
      }
    }

    // Convert MIDI note to note name
    const noteNames = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const octave = Math.floor((closestNote - 12) / 12);
    const noteIndex = (closestNote - 12) % 12;
    const noteName = noteNames[noteIndex];

    // Build the sample filename to match your downloaded files
    const fullNoteName = `${noteName}${octave}`;
    const sampleUrl = `/piano-samples/${fullNoteName}v${velocityLayer}.${sampleFormat}`;

    return { url: sampleUrl, midiNote: closestNote };
  }, []);

  // Get the original frequency for a piano sample
  const getSampleFrequency = useCallback((midiNote) => {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }, []);

  // Fallback oscillator sound (original implementation)
  const playOscillatorSound = useCallback(
    (frequency, duration = 0.3, volume = 0.3) => {
      if (!audioContextRef.current) return;

      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      oscillator.frequency.setValueAtTime(
        frequency,
        audioContextRef.current.currentTime
      );
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(volume, audioContextRef.current.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContextRef.current.currentTime + duration
      );

      oscillator.start();
      oscillator.stop(audioContextRef.current.currentTime + duration);
    },
    []
  ); // Optimized play sound with caching and throttling
  const playSound = useCallback(
    async (
      frequency,
      duration = 0.3,
      volume = 0.3,
      midiNote = 69,
      velocity = 64
    ) => {
      if (!audioContextRef.current || !soundEnabled) return;

      // Throttle rapid key presses to prevent audio overload
      const keyThrottleKey = `${midiNote}-${velocity}`;
      const now = Date.now();
      const lastPress = lastKeyPressTime.current.get(keyThrottleKey) || 0;

      if (now - lastPress < 50) {
        // 50ms throttle
        return;
      }
      lastKeyPressTime.current.set(keyThrottleKey, now);

      // If piano samples are disabled, use oscillator directly
      if (!usePianoSamples) {
        setSampleStatus("oscillator");
        playOscillatorSound(frequency, duration, volume);
        return;
      }

      // Try to load sample with caching
      const tryLoadSample = async (sampleInfo) => {
        const { url, midiNote: sampleMidiNote } = sampleInfo;

        try {
          // Check cache first
          const cacheKey = url;
          let audioBuffer = audioBufferCache.current.get(cacheKey);

          if (!audioBuffer) {
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            audioBuffer = await audioContextRef.current.decodeAudioData(
              arrayBuffer
            );

            // Cache the decoded audio buffer
            audioBufferCache.current.set(cacheKey, audioBuffer);
          }

          const source = audioContextRef.current.createBufferSource();
          const gainNode = audioContextRef.current.createGain();

          source.buffer = audioBuffer;
          source.connect(gainNode);
          gainNode.connect(audioContextRef.current.destination);

          // Calculate playback rate to match the target frequency
          const sampleFrequency = getSampleFrequency(sampleMidiNote);
          const playbackRate = frequency / sampleFrequency;
          source.playbackRate.setValueAtTime(
            playbackRate,
            audioContextRef.current.currentTime
          );

          gainNode.gain.setValueAtTime(
            volume,
            audioContextRef.current.currentTime
          );
          gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioContextRef.current.currentTime + duration
          );

          source.start();
          source.stop(audioContextRef.current.currentTime + duration);

          setSampleStatus("loaded");
          return true;
        } catch (error) {
          console.warn(`Failed to load sample ${url}:`, error.message);
          return false;
        }
      };

      try {
        // Primary attempt - try the calculated closest sample
        const primarySample = getPianoSampleUrl(midiNote, velocity);
        let success = await tryLoadSample(primarySample);

        if (success) return;

        // Fallback 1: Try different velocity layers of the same note
        const velocityFallbacks = [8, 4, 12, 1, 16];

        for (const fallbackVelocity of velocityFallbacks) {
          const fallbackSample = getPianoSampleUrl(
            midiNote,
            fallbackVelocity * 8
          );
          success = await tryLoadSample(fallbackSample);
          if (success) return;
        }

        // Fallback 2: Try A4 reference sample
        const a4Sample = { url: "/piano-samples/A4v8.flac", midiNote: 69 };
        success = await tryLoadSample(a4Sample);
        if (success) return; // Final fallback: use oscillator
        throw new Error("All sample fallbacks failed");
      } catch {
        setSampleStatus("fallback");
        playOscillatorSound(frequency, duration, volume);
      }
    },
    [
      getPianoSampleUrl,
      getSampleFrequency,
      playOscillatorSound,
      usePianoSamples,
      soundEnabled,
    ]
  );
  // Optimized visual note creation with throttling
  const createVisualNote = useCallback(
    (keyData, duration = null) => {
      if (!pianoRef.current) return;

      // Throttle visual note creation for better performance
      const noteThrottleKey = `visual-${keyData.id}`;
      const now = Date.now();
      const lastNoteTime = lastKeyPressTime.current.get(noteThrottleKey) || 0;

      if (now - lastNoteTime < 30 && !duration) {
        // 30ms throttle for visual notes
        return null;
      }
      lastKeyPressTime.current.set(noteThrottleKey, now);

      const noteId = ++noteIdCounter.current;
      const whiteKeyIndex = whiteKeys.findIndex((k) => k.id === keyData.id);
      const whiteKeyWidth = 100 / whiteKeys.length; // Width of each white key in percentage

      let leftPosition, noteWidth;

      if (keyData.isBlack) {
        // For black keys: position based on white keys before it
        const whiteKeysBefore = keys
          .slice(0, keyData.id)
          .filter((k) => !k.isBlack).length;

        // Black key starts at 70% of the white key before it
        leftPosition = (whiteKeysBefore - 0.3) * whiteKeyWidth;
        noteWidth = whiteKeyWidth * 0.6; // Black key width is 60% of white key
      } else {
        // For white keys: position based on white key index
        leftPosition = whiteKeyIndex * whiteKeyWidth;
        noteWidth = whiteKeyWidth; // Full white key width
      }

      const visualNote = {
        id: noteId,
        keyId: keyData.id,
        note: keyData.note,
        isBlack: keyData.isBlack,
        leftPosition, // This is now the exact left edge position
        noteWidth,
        startTime: Date.now(),
        duration: duration || null,
        color: keyData.isBlack ? "#8b5cf6" : "#3b82f6",
      };

      setVisualNotes((prev) => [...prev, visualNote]);
      return noteId;
    },
    [keys, whiteKeys]
  );

  // End visual note animation
  const endVisualNote = useCallback((noteId, duration) => {
    setVisualNotes((prev) =>
      prev.map((note) =>
        note.id === noteId ? { ...note, duration, endTime: Date.now() } : note
      )
    );
  }, []);
  // Handle key press
  const handleKeyPress = useCallback(
    (keyData) => {
      if (pressedKeys.has(keyData.id)) return;
      setPressedKeys((prev) => new Set([...prev, keyData.id]));
      const velocity = keyData.velocity || 64;
      const volume = (velocity / 127) * 0.3;
      playSound(keyData.frequency, 0.3, volume, keyData.midiNote, velocity);

      const noteId = createVisualNote(keyData);

      if (isRecording) {
        const now = Date.now();
        if (!recordingStartTimeRef.current) {
          recordingStartTimeRef.current = now;
        }

        const startTime = now - recordingStartTimeRef.current;
        setActiveNotes(
          (prev) =>
            new Map([
              ...prev,
              [keyData.id, { ...keyData, startTime, visualNoteId: noteId }],
            ])
        );
      }
    },
    [pressedKeys, playSound, isRecording, createVisualNote]
  );

  // Handle key release
  const handleKeyRelease = useCallback(
    (keyData) => {
      setPressedKeys((prev) => {
        const newSet = new Set(prev);
        newSet.delete(keyData.id);
        return newSet;
      });

      if (isRecording && activeNotes.has(keyData.id)) {
        const noteData = activeNotes.get(keyData.id);
        const endTime = Date.now() - recordingStartTimeRef.current;
        const duration = endTime - noteData.startTime;

        if (noteData.visualNoteId) {
          endVisualNote(noteData.visualNoteId, duration);
        }

        setRecordedNotes((prev) => [
          ...prev,
          {
            ...noteData,
            duration: Math.max(duration, 100),
          },
        ]);

        setActiveNotes((prev) => {
          const newMap = new Map(prev);
          newMap.delete(keyData.id);
          return newMap;
        });
      } else {
        const activeVisualNotes = visualNotes.filter(
          (note) => note.keyId === keyData.id && !note.duration
        );
        activeVisualNotes.forEach((note) => {
          const duration = Date.now() - note.startTime;
          endVisualNote(note.id, duration);
        });
      }
    },
    [isRecording, activeNotes, visualNotes, endVisualNote]
  );

  // Handle MIDI messages
  const handleMIDIMessage = useCallback(
    (event) => {
      const [status, note, velocity] = event.data;
      const isNoteOn = (status & 0xf0) === 0x90 && velocity > 0;
      const isNoteOff =
        (status & 0xf0) === 0x80 ||
        ((status & 0xf0) === 0x90 && velocity === 0);

      if (isNoteOn || isNoteOff) {
        const keyIndex = keys.findIndex((key) => key.midiNote === note);
        if (keyIndex !== -1) {
          const keyData = keys[keyIndex];

          if (isNoteOn) {
            handleKeyPress({ ...keyData, velocity });
          } else {
            handleKeyRelease(keyData);
          }
        }
      }
    },
    [keys, handleKeyPress, handleKeyRelease]
  );

  // Setup MIDI event listeners
  useEffect(() => {
    if (!midiAccess) return;

    for (const input of midiAccess.inputs.values()) {
      input.addEventListener("midimessage", handleMIDIMessage);
    }

    const stateChangeHandler = () => {
      const updatedDevices = [];
      for (const input of midiAccess.inputs.values()) {
        updatedDevices.push(input);
        input.removeEventListener("midimessage", handleMIDIMessage);
        input.addEventListener("midimessage", handleMIDIMessage);
      }
      setConnectedDevices(updatedDevices);
    };

    midiAccess.addEventListener("statechange", stateChangeHandler);

    return () => {
      for (const input of midiAccess.inputs.values()) {
        input.removeEventListener("midimessage", handleMIDIMessage);
      }
      midiAccess.removeEventListener("statechange", stateChangeHandler);
    };
  }, [midiAccess, handleMIDIMessage]);

  // Toggle recording
  const toggleRecording = () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      recordingStartTimeRef.current = null; // Add any remaining active notes
      activeNotes.forEach((noteData) => {
        const endTime = Date.now() - recordingStartTimeRef.current;
        const duration = endTime - noteData.startTime;
        setRecordedNotes((prev) => [
          ...prev,
          {
            ...noteData,
            duration: Math.max(duration, 100),
          },
        ]);
      });
      setActiveNotes(new Map());
    } else {
      // Start recording
      setIsRecording(true);
      setRecordedNotes([]);
      recordingStartTimeRef.current = Date.now();
    }
  };

  // Replay recorded notes
  const replayRecording = () => {
    if (recordedNotes.length === 0 || isReplaying) return;

    setIsReplaying(true);

    // Clear any existing timeouts
    replayTimeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    replayTimeoutRefs.current = [];
    recordedNotes.forEach((note) => {
      // Schedule note on
      const onTimeout = setTimeout(() => {
        setPressedKeys((prev) => new Set([...prev, note.id]));
        const velocity = note.velocity || 64;
        playSound(
          note.frequency,
          note.duration / 1000,
          0.3,
          note.midiNote,
          velocity
        );

        // Create visual note for replay
        const noteId = createVisualNote(note, note.duration);

        // End visual note after duration
        setTimeout(() => {
          endVisualNote(noteId, note.duration);
        }, note.duration);
      }, note.startTime);

      // Schedule note off
      const offTimeout = setTimeout(() => {
        setPressedKeys((prev) => {
          const newSet = new Set(prev);
          newSet.delete(note.id);
          return newSet;
        });
      }, note.startTime + note.duration);

      replayTimeoutRefs.current.push(onTimeout, offTimeout);
    });

    // Stop replaying after all notes are done
    const maxTime = Math.max(
      ...recordedNotes.map((note) => note.startTime + note.duration)
    );
    const stopTimeout = setTimeout(() => {
      setIsReplaying(false);
    }, maxTime + 100);

    replayTimeoutRefs.current.push(stopTimeout);
  };

  // Stop replay
  const stopReplay = () => {
    replayTimeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    replayTimeoutRefs.current = [];
    setIsReplaying(false);
    setPressedKeys(new Set());
  };

  // Clear recording
  const clearRecording = () => {
    setRecordedNotes([]);
    setActiveNotes(new Map());
    setIsRecording(false);
    recordingStartTimeRef.current = null;
    setVisualNotes([]);
    stopReplay();
  };

  // Export MIDI file
  const exportMIDI = () => {
    if (recordedNotes.length === 0) {
      alert("No notes recorded to export!");
      return;
    }

    const midiData = generateMIDIFile(recordedNotes);
    const blob = new Blob([midiData], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `piano-recording-${Date.now()}.mid`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }; // Memoized visual notes rendering to reduce recalculations
  const renderedVisualNotes = useMemo(() => {
    // Only update when visualNotes actually changes
    const currentTime = Date.now();

    return visualNotes.map((note) => {
      const elapsed = currentTime - note.startTime;
      const noteDuration = note.duration || elapsed;

      // Note height based on duration - grows while held
      const baseHeight = 20;
      const growthRate = performanceMode ? 20 : 10; // Faster growth in performance mode
      const durationScale = noteDuration / growthRate;
      const noteHeight = Math.min(
        Math.max(baseHeight + durationScale, 20),
        performanceMode ? 200 : 320 // Shorter max height in performance mode
      );

      let noteTop,
        opacity = 0.9;

      // Keys are at the bottom, but notes should start from the top of the keys
      const keyHeight = 160; // Approximate key height in pixels
      const containerHeight = 500; // Total container height
      const keyTopPosition =
        ((containerHeight - keyHeight) / containerHeight) * 100;

      if (note.duration) {
        // Note has been released - slide upward from final growing position
        const elapsedSinceRelease = elapsed - note.duration;
        const slideDistancePixels = (keyTopPosition / 100) * containerHeight;
        const slideAnimationDuration = slideDistancePixels * growthRate;
        const slideProgress = Math.min(
          elapsedSinceRelease / slideAnimationDuration,
          1
        );

        // Calculate the final height the note reached while growing
        const finalGrowthHeight = Math.min(
          Math.max(baseHeight + note.duration / growthRate, 20),
          performanceMode ? 200 : 320
        );

        // Store the release position (where the note should start sliding from)
        if (!note.releasePosition) {
          note.releasePosition =
            keyTopPosition - (finalGrowthHeight / containerHeight) * 100;
        }

        // Slide the entire note upward from its stored release position
        const slideDistance = keyTopPosition;
        const currentSlideOffset = slideDistance * slideProgress;
        noteTop = note.releasePosition - currentSlideOffset;

        // Fade out in the last 25% of slide animation
        if (slideProgress > 0.75) {
          opacity = (1 - slideProgress) * 4;
        }
      } else {
        // Note is still being held - grow from key tops upward
        noteTop = keyTopPosition - (noteHeight / containerHeight) * 100;
      }

      return {
        ...note,
        noteHeight,
        noteTop,
        opacity: Math.max(opacity, 0),
      };
    });
  }, [visualNotes, performanceMode]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
      <div className="max-w-full mx-auto" ref={containerRef}>
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            88-Key Piano Visualizer
          </h1>{" "}
          {/* MIDI Device Status */}
          <div className="mb-4">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-300">
              <Usb size={16} />
              <span>
                MIDI Devices:{" "}
                {connectedDevices.length > 0
                  ? connectedDevices.map((d) => d.name).join(", ")
                  : "None connected"}
              </span>
            </div>{" "}
            {/* Sample Status */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  sampleStatus === "loaded"
                    ? "bg-green-400"
                    : sampleStatus === "fallback"
                    ? "bg-yellow-400"
                    : sampleStatus === "oscillator"
                    ? "bg-blue-400"
                    : "bg-gray-400"
                }`}
              ></div>
              <span>
                Audio:{" "}
                {sampleStatus === "loaded"
                  ? "Piano Samples with Velocity Layers"
                  : sampleStatus === "fallback"
                  ? "Oscillator Fallback"
                  : sampleStatus === "oscillator"
                  ? "Oscillator Mode"
                  : "Loading..."}
              </span>{" "}
              {/* Audio Mode Toggle */}
              <button
                onClick={() => setUsePianoSamples(!usePianoSamples)}
                className="ml-2 px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded transition-colors duration-200"
                title={`Switch to ${
                  usePianoSamples ? "Oscillator" : "Piano Samples"
                }`}
              >
                {usePianoSamples ? "🎹→🎵" : "🎵→🎹"}
              </button>{" "}
              {/* Sound On/Off Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`ml-2 px-2 py-1 text-white text-xs rounded transition-colors duration-200 ${
                  soundEnabled
                    ? "bg-green-600 hover:bg-green-500"
                    : "bg-red-600 hover:bg-red-500"
                }`}
                title={soundEnabled ? "Mute Sound" : "Unmute Sound"}
              >
                {soundEnabled ? "🔊" : "🔇"}
              </button>
              {/* Performance Mode Toggle */}
              <button
                onClick={() => setPerformanceMode(!performanceMode)}
                className={`ml-2 px-2 py-1 text-white text-xs rounded transition-colors duration-200 ${
                  performanceMode
                    ? "bg-orange-600 hover:bg-orange-500"
                    : "bg-gray-600 hover:bg-gray-500"
                }`}
                title={`${
                  performanceMode ? "Disable" : "Enable"
                } Performance Mode (faster animations, less visual effects)`}
              >
                {performanceMode ? "⚡" : "🐌"}
              </button>
            </div>
          </div>
          {/* Controls */}
          <div className="flex justify-center items-center gap-2 md:gap-4 flex-wrap">
            <button
              onClick={toggleRecording}
              className={`flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 md:py-3 rounded-lg font-semibold transition-all duration-200 text-sm md:text-base ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                  : "bg-green-500 hover:bg-green-600 text-white"
              }`}
            >
              {isRecording ? <Square size={16} /> : <Play size={16} />}
              {isRecording ? "Stop" : "Record"}
            </button>

            <button
              onClick={isReplaying ? stopReplay : replayRecording}
              disabled={recordedNotes.length === 0}
              className={`flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 md:py-3 rounded-lg font-semibold transition-all duration-200 text-sm md:text-base ${
                isReplaying
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-purple-500 hover:bg-purple-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white"
              }`}
            >
              {isReplaying ? <Square size={16} /> : <Volume2 size={16} />}
              {isReplaying ? "Stop" : "Replay"}
            </button>

            <button
              onClick={clearRecording}
              className="flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 md:py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-all duration-200 text-sm md:text-base"
            >
              <RotateCcw size={16} />
              Clear
            </button>

            <button
              onClick={exportMIDI}
              disabled={recordedNotes.length === 0}
              className="flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 md:py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all duration-200 text-sm md:text-base"
            >
              <Download size={16} />
              MIDI ({recordedNotes.length})
            </button>
          </div>
        </div>{" "}
        {/* Piano Container with Animation Space */}
        <div
          className="relative bg-gray-800 rounded-lg shadow-2xl overflow-hidden"
          style={{ minHeight: "500px" }}
        >
          {/* Animation Space Above Piano */}
          <div className="h-80 relative">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-800/10 to-gray-800/30 rounded-lg">
              <div className="text-center pt-32 text-gray-400 text-sm">
                ♪ Note Animation Space ♪<br />
                <span className="text-xs">
                  Notes grow upward while held, then slide up when released
                </span>
              </div>
            </div>
          </div>{" "}
          {/* Visual Notes Animation Layer */}
          <div className="absolute inset-0 pointer-events-none z-20">
            {renderedVisualNotes.map((note) => {
              return (
                <div
                  key={note.id}
                  className={`absolute rounded-md shadow-lg transition-opacity duration-200 ${
                    performanceMode ? "" : "shadow-lg"
                  }`}
                  style={{
                    left: `${note.leftPosition}%`, // Exact left position of the key
                    top: `${note.noteTop}%`,
                    width: `${note.noteWidth}%`, // Exact width of the key
                    height: `${note.noteHeight}px`,
                    backgroundColor: note.color,
                    opacity: note.opacity,
                    boxShadow: performanceMode
                      ? "none"
                      : `0 0 20px ${note.color}`,
                    border: performanceMode
                      ? `1px solid ${note.color}`
                      : `2px solid ${note.color}`,
                    background: performanceMode
                      ? note.color
                      : `linear-gradient(180deg, ${note.color}, ${note.color}88)`,
                  }}
                >
                  {/* Note label - only show in non-performance mode for better performance */}
                  {!performanceMode && (
                    <div
                      className="absolute top-1 left-1/2 transform -translate-x-1/2 text-xs font-bold text-white"
                      style={{ fontSize: note.isBlack ? "8px" : "10px" }}
                    >
                      {note.note.replace(/[0-9]/g, "")}
                    </div>
                  )}

                  {/* Note duration indicator at bottom - only show in non-performance mode */}
                  {!performanceMode && note.duration && (
                    <div
                      className="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-xs font-bold text-white opacity-75"
                      style={{ fontSize: "8px" }}
                    >
                      {Math.round(note.duration)}ms
                    </div>
                  )}
                </div>
              );
            })}
          </div>{" "}
          {/* Piano positioned at the bottom of the animation space */}
          <div className="absolute bottom-0 left-0 right-0 z-30" ref={pianoRef}>
            {/* White Keys */}
            <div className="flex w-full">
              {whiteKeys.map((key) => (
                <button
                  key={key.id}
                  onMouseDown={() => handleKeyPress(key)}
                  onMouseUp={() => handleKeyRelease(key)}
                  onMouseLeave={() => handleKeyRelease(key)}
                  className={`relative h-32 md:h-40 mx-px rounded-b-lg border-2 border-gray-300 transition-all duration-75 transform flex-1 ${
                    pressedKeys.has(key.id)
                      ? "bg-gradient-to-b from-blue-200 to-blue-300 border-blue-400 scale-95 shadow-inner"
                      : "bg-gradient-to-b from-white to-gray-100 hover:from-gray-50 hover:to-gray-200 shadow-lg hover:shadow-xl"
                  }`}
                  style={{
                    maxWidth: `${keyWidth * 1.5}px`,
                    minWidth: `${Math.max(keyWidth, 8)}px`,
                    boxShadow: pressedKeys.has(key.id)
                      ? "inset 0 4px 8px rgba(0,0,0,0.3)"
                      : "0 8px 16px rgba(0,0,0,0.2)",
                  }}
                >
                  <div className="absolute bottom-1 md:bottom-2 left-1/2 transform -translate-x-1/2 text-xs text-gray-600 font-mono">
                    {keyWidth > 10 ? key.note : key.note.replace(/[0-9]/g, "")}
                  </div>
                </button>
              ))}
            </div>

            {/* Black Keys */}
            <div className="absolute top-0 left-0 flex w-full">
              {keys.map((key, index) => {
                if (!key.isBlack) return null;

                // Calculate position based on the pattern of black keys
                const whiteKeysBefore = keys
                  .slice(0, index)
                  .filter((k) => !k.isBlack).length;
                const whiteKeyWidth = 100 / whiteKeys.length;
                const leftPercentage = (whiteKeysBefore - 0.3) * whiteKeyWidth;

                return (
                  <button
                    key={key.id}
                    onMouseDown={() => handleKeyPress(key)}
                    onMouseUp={() => handleKeyRelease(key)}
                    onMouseLeave={() => handleKeyRelease(key)}
                    className={`absolute h-20 md:h-24 rounded-b-lg border border-gray-800 transition-all duration-75 transform ${
                      pressedKeys.has(key.id)
                        ? "bg-gradient-to-b from-purple-400 to-purple-600 scale-95 shadow-inner"
                        : "bg-gradient-to-b from-gray-800 to-black hover:from-gray-700 hover:to-gray-900 shadow-lg"
                    }`}
                    style={{
                      left: `${leftPercentage}%`,
                      width: `${whiteKeyWidth * 0.6}%`,
                      zIndex: 10,
                      boxShadow: pressedKeys.has(key.id)
                        ? "inset 0 4px 8px rgba(0,0,0,0.5)"
                        : "0 8px 16px rgba(0,0,0,0.4)",
                    }}
                  >
                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-xs text-white font-mono">
                      {keyWidth > 10
                        ? key.note
                        : key.note.replace(/[0-9]/g, "")}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {/* Instructions */}
        <div className="mt-6 text-center text-gray-300">
          <p className="mb-2 text-sm md:text-base">
            Click keys to play or connect a MIDI device. Record, replay, and
            export your performances.
          </p>
          <p className="text-xs md:text-sm">
            Piano automatically scales to fit your screen width • All 88 keys
            (A0 to C8) • Note length shows duration
          </p>
        </div>
      </div>
    </div>
  );
};

export default PianoVisualizer;
