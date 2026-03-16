import React, { useState, FC, useRef, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Container, Button, Spacer, Slider } from '../../components';
import { AudioContext } from 'react-native-audio-api';
import type {
  AudioBufferQueueSourceNode,
  AudioBuffer,
} from 'react-native-audio-api';

// Generate a mono sine wave buffer (1 channel).
// This is the key ingredient for the repro: enqueuing a mono buffer into a
// queue source node that defaults to 2 channels triggers an out-of-bounds
// read in processWithInterpolation when playbackRate != 1.0.
function createMonoSineBuffer(
  context: AudioContext,
  frequency: number,
  durationSec: number
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const buffer = context.createBuffer(1, length, sampleRate);
  const channel = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    channel[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5;
  }

  return buffer;
}

const QueueSource: FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.5);

  const aCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferQueueSourceNode | null>(null);

  const play = () => {
    if (!aCtxRef.current) {
      aCtxRef.current = new AudioContext();
    }

    const ctx = aCtxRef.current;

    // Create a queue source with no pitch correction so that non-1.0
    // playbackRate hits the interpolation code path.
    const source = ctx.createBufferQueueSource({ pitchCorrection: false });
    source.playbackRate.value = playbackRate;
    source.connect(ctx.destination);

    // Enqueue several short mono sine buffers at different frequencies.
    const frequencies = [440, 554, 659, 880];
    for (const freq of frequencies) {
      const buf = createMonoSineBuffer(ctx, freq, 0.5);
      source.enqueueBuffer(buf);
    }

    source.onBufferEnded = (event) => {
      if (event.isLastBufferInQueue) {
        setIsPlaying(false);
        sourceRef.current = null;
      }
    };

    source.start(ctx.currentTime);
    sourceRef.current = source;
    setIsPlaying(true);
  };

  const stop = () => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setIsPlaying(false);
  };

  useEffect(() => {
    return () => {
      sourceRef.current?.stop();
      aCtxRef.current?.close();
    };
  }, []);

  return (
    <Container>
      <View style={styles.container}>
        <Text style={styles.description}>
          Enqueues mono (1-channel) buffers into an AudioBufferQueueSourceNode
          and plays them with a non-1.0 playback rate. Without the channel count
          fix, this crashes due to an out-of-bounds channel access in the
          interpolation path.
        </Text>

        <Spacer.Vertical size={24} />

        <Slider
          label="Playback Rate"
          value={playbackRate}
          onValueChange={setPlaybackRate}
          min={0.5}
          max={2.0}
          step={0.25}
          minLabelWidth={80}
        />

        <Spacer.Vertical size={20} />

        <Button
          title={isPlaying ? 'Stop' : 'Play Mono Queue'}
          onPress={isPlaying ? stop : play}
        />
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default QueueSource;
