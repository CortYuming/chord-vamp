import { describe, it, expect } from 'vitest';
import { DrawQueue } from './drawqueue';

describe('DrawQueue', () => {
  it('holds an event until its time comes', () => {
    const q = new DrawQueue<string>();
    q.schedule('bar 1', 10);
    expect(q.due(9.9)).toBe(null);
    expect(q.due(10)).toBe('bar 1');
  });

  it('draws an event that is a frame early', () => {
    const q = new DrawQueue<string>();
    q.schedule('bar 1', 10);
    expect(q.due(9.995)).toBe('bar 1');
  });

  it('gives nothing when nothing is queued', () => {
    const q = new DrawQueue<string>();
    expect(q.due(10)).toBe(null);
  });

  it('collapses a frame that several events fall in to the latest one', () => {
    const q = new DrawQueue<string>();
    q.schedule('bar 1', 10);
    q.schedule('bar 2', 10.5);
    q.schedule('bar 3', 11);
    expect(q.due(11)).toBe('bar 3');
    expect(q.length).toBe(0);
  });

  // The reason this class exists: Tone.Draw drops anything it reaches more
  // than 0.25s late, which leaves the playhead behind on a bar that has
  // stopped sounding. A stall of any length here still lands on the right bar.
  it('still draws an event the frame arrives seconds late for', () => {
    const q = new DrawQueue<string>();
    q.schedule('bar 1', 10);
    q.schedule('bar 2', 11);
    expect(q.due(30)).toBe('bar 2');
  });

  it('keeps later events queued after a draw', () => {
    const q = new DrawQueue<string>();
    q.schedule('bar 1', 10);
    q.schedule('bar 2', 20);
    expect(q.due(10)).toBe('bar 1');
    expect(q.length).toBe(1);
    expect(q.due(15)).toBe(null);
    expect(q.due(20)).toBe('bar 2');
  });

  it('forgets everything on clear', () => {
    const q = new DrawQueue<string>();
    q.schedule('bar 1', 10);
    q.clear();
    expect(q.length).toBe(0);
    expect(q.due(10)).toBe(null);
  });
});
