# React Piano Visualizer

A beautiful and interactive 88-key piano visualizer built with React, featuring MIDI support, real-time audio synthesis, and note animation effects.

## 🎹 Features

- **88-Key Piano**: Complete piano keyboard from A0 to C8
- **MIDI Device Support**: Connect and play with external MIDI keyboards
- **Real-time Audio**: Web Audio API-powered sound synthesis
- **Recording & Playback**: Record your performances and replay them
- **Visual Animations**: Beautiful note animations that grow and slide upward
- **MIDI Export**: Export recorded performances as MIDI files
- **Responsive Design**: Adaptive keyboard sizing for different screen sizes
- **Accessibility**: Keyboard navigation and screen reader support

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/react-piano-visualizer.git
cd react-piano-visualizer
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

## 🎵 How to Use

### Basic Piano Playing
- **Mouse**: Click on piano keys to play notes
- **Keyboard**: Use your computer keyboard to play (QWERTY layout maps to piano keys)

### MIDI Device Support
1. Connect your MIDI keyboard to your computer
2. The app will automatically detect and connect to MIDI devices
3. Play your MIDI keyboard to hear audio and see visual effects

### Recording & Playback
1. Click the **Record** button to start recording your performance
2. Play notes on the piano or MIDI device
3. Click **Stop** to end recording
4. Use **Replay** to playback your recorded performance
5. **Clear** removes the current recording
6. **Export MIDI** downloads your recording as a .mid file

## 🛠️ Technology Stack

- **React 18**: Modern functional components with hooks
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework
- **Web Audio API**: Real-time audio synthesis
- **Web MIDI API**: MIDI device communication
- **Lucide React**: Beautiful icons

## 🎨 Key Components

### PianoVisualizer
The main component that orchestrates all piano functionality:
- Keyboard rendering and interaction
- Audio synthesis and playback
- MIDI device integration
- Recording and export features
- Visual note animations

### Features Implemented
- **Note Mapping**: Accurate frequency calculation for all 88 keys
- **Animation System**: Smooth note animations with proper cleanup
- **State Management**: Comprehensive React state for all functionality
- **Performance Optimization**: useCallback and useMemo for optimal rendering

## 🎯 Browser Compatibility

- **Chrome/Chromium**: Full support (recommended)
- **Firefox**: Audio supported, MIDI may require enabling in about:config
- **Safari**: Limited MIDI support
- **Edge**: Full support

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Web Audio API for real-time sound synthesis
- Web MIDI API for MIDI device support
- React and Vite communities for excellent tooling
- Tailwind CSS for rapid UI development

## 🐛 Known Issues

- MIDI support may vary between browsers
- Some browsers may require user interaction before audio can play
- Performance may vary on older devices

## 🔮 Future Enhancements

- [ ] Multiple instrument sounds
- [ ] Audio effects (reverb, delay, etc.)
- [ ] Sheet music display
- [ ] Chord recognition
- [ ] Metronome functionality
- [ ] Multiple recording tracks
