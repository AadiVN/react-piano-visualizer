import React, { useState, useEffect, useRef, useCallback } from "react";
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

  const audioContextRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const replayTimeoutRefs = useRef([]);
  const containerRef = useRef(null);
  const pianoRef = useRef(null);
  const noteIdCounter = useRef(0);
  const animationFrameRef = useRef(null);

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
  }, []);
  // Animation loop for continuous rendering and note cleanup
  useEffect(() => {
    const animationLoop = () => {
      const currentTime = Date.now();

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
  }, []);

  // Play sound for a key
  const playSound = useCallback((frequency, duration = 0.3, volume = 0.3) => {
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
  }, []);

  // Create visual note animation
  const createVisualNote = useCallback(
    (keyData, duration = null) => {
      if (!pianoRef.current) return;

      const noteId = ++noteIdCounter.current;
      const whiteKeys = keys.filter((k) => !k.isBlack);
      const whiteKeyIndex = whiteKeys.findIndex((k) => k.id === keyData.id);

      let leftPosition;
      if (keyData.isBlack) {
        const whiteKeysBefore = keys
          .slice(0, keyData.id)
          .filter((k) => !k.isBlack).length;
        leftPosition = ((whiteKeysBefore - 0.3) / whiteKeys.length) * 100;
      } else {
        leftPosition = (whiteKeyIndex / whiteKeys.length) * 100;
      }

      const visualNote = {
        id: noteId,
        keyId: keyData.id,
        note: keyData.note,
        isBlack: keyData.isBlack,
        leftPosition,
        startTime: Date.now(),
        duration: duration || null,
        color: keyData.isBlack ? "#8b5cf6" : "#3b82f6",
      };

      setVisualNotes((prev) => [...prev, visualNote]);
      return noteId;
    },
    [keys]
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
      const volume = ((keyData.velocity || 64) / 127) * 0.3;
      playSound(keyData.frequency, 0.3, volume);

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
        playSound(note.frequency, note.duration / 1000);

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
  };
  // Render white keys
  const whiteKeys = keys.filter((key) => !key.isBlack);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
      <div className="max-w-full mx-auto" ref={containerRef}>
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            88-Key Piano Visualizer
          </h1>

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
        </div>

        {/* Piano Container with Animation Space */}
        <div
          className="relative bg-gray-800 rounded-lg p-4 md:p-6 shadow-2xl overflow-hidden"
          style={{ minHeight: "400px" }}
        >
          {" "}
          {/* Visual Notes Animation Layer */}
          <div className="absolute inset-0 pointer-events-none z-20">
            {visualNotes.map((note) => {
              const currentTime = Date.now();
              const elapsed = currentTime - note.startTime;
              const noteDuration = note.duration || elapsed;

              // Note height based on duration - grows while held
              const baseHeight = 20;
              const durationScale = noteDuration / 10; // 1px per 10ms for faster growth
              const noteHeight = Math.min(
                Math.max(baseHeight + durationScale, 20),
                280 // Max height to fit in animation space
              );

              let noteTop,
                opacity = 0.9;
              const keyLevel = 75; // Percentage from top where keys are

              if (note.duration) {
                // Note has been released - slide upward from final growing position
                const elapsedSinceRelease = elapsed - note.duration;
                const slideAnimationDuration = 3000; // 3 seconds to slide up
                const slideProgress = Math.min(
                  elapsedSinceRelease / slideAnimationDuration,
                  1
                );

                // Calculate the final height the note reached while growing
                const finalGrowthHeight = Math.min(
                  Math.max(baseHeight + note.duration / 10, 20),
                  280
                );

                // Store the release position (where the note should start sliding from)
                if (!note.releasePosition) {
                  note.releasePosition =
                    keyLevel - (finalGrowthHeight / 400) * 100;
                }

                // Slide the entire note upward from its stored release position
                const slideDistance = 90; // Slide 90% up from release position
                const currentSlideOffset = slideDistance * slideProgress;

                noteTop = note.releasePosition - currentSlideOffset;

                // Fade out in the last 25% of slide animation
                if (slideProgress > 0.75) {
                  opacity = (1 - slideProgress) * 4;
                }
              } else {
                // Note is still being held - grow from keys upward
                noteTop = keyLevel - (noteHeight / 400) * 100; // Convert px to % consistently
              }

              return (
                <div
                  key={note.id}
                  className="absolute rounded-md shadow-lg transition-opacity duration-200"
                  style={{
                    left: `${note.leftPosition}%`,
                    top: `${noteTop}%`,
                    width: note.isBlack ? "2.5%" : "3.5%",
                    height: `${noteHeight}px`,
                    backgroundColor: note.color,
                    opacity: Math.max(opacity, 0),
                    transform: "translateX(-50%)",
                    boxShadow: `0 0 20px ${note.color}`,
                    border: `2px solid ${note.color}`,
                    background: `linear-gradient(180deg, ${note.color}, ${note.color}88)`,
                  }}
                >
                  {/* Note label */}
                  <div
                    className="absolute top-1 left-1/2 transform -translate-x-1/2 text-xs font-bold text-white"
                    style={{ fontSize: note.isBlack ? "8px" : "10px" }}
                  >
                    {note.note.replace(/[0-9]/g, "")}
                  </div>

                  {/* Note duration indicator at bottom */}
                  {note.duration && (
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
          {/* Animation Space Above Piano */}
          <div className="h-48 mb-4 relative">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-800/20 to-gray-800/40 rounded-lg">
              <div className="text-center pt-20 text-gray-400 text-sm">
                ♪ Note Animation Space ♪<br />
                <span className="text-xs">
                  Notes grow upward while held, then slide up when released
                </span>
              </div>
            </div>
          </div>
          <div className="relative w-full" ref={pianoRef}>
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
