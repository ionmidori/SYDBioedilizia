import { markChatFinish, markChatFirstText, markChatSend } from '../latency';

/** Minimal User Timing API: JSDOM only implements performance.now(). */
type Entry = { name: string; startTime: number; duration: number };
let marks: Entry[] = [];
let measureEntries: Entry[] = [];
let clock = 0;

const fakeTiming = {
    mark: (name: string) => {
        clock += 5;
        marks.push({ name, startTime: clock, duration: 0 });
    },
    measure: (name: string, start: string, end: string) => {
        const s = marks.filter(m => m.name === start).pop();
        const e = marks.filter(m => m.name === end).pop();
        if (!s || !e) throw new Error('missing mark');
        const entry = { name, startTime: s.startTime, duration: e.startTime - s.startTime };
        measureEntries.push(entry);
        return entry;
    },
    clearMarks: (name?: string) => {
        marks = name ? marks.filter(m => m.name !== name) : [];
    },
};

const measures = (name: string) => measureEntries.filter(m => m.name === name);

beforeAll(() => {
    Object.assign(performance, fakeTiming);
});

describe('chat latency marks', () => {
    beforeEach(() => {
        markChatFinish(); // close any turn left open by a previous test
        marks = [];
        measureEntries = [];
    });

    it('measures TTFT once per turn and the total at finish', () => {
        markChatSend();
        markChatFirstText();
        markChatFirstText(); // later tokens of the same turn are ignored
        markChatFinish();

        expect(measures('syd-chat:ttft')).toHaveLength(1);
        expect(measures('syd-chat:total')).toHaveLength(1);
        expect(measures('syd-chat:ttft')[0].duration).toBeLessThanOrEqual(
            measures('syd-chat:total')[0].duration
        );
    });

    it('ignores first-text and finish outside of a turn', () => {
        markChatFirstText();
        markChatFinish();
        expect(measures('syd-chat:ttft')).toHaveLength(0);
        expect(measures('syd-chat:total')).toHaveLength(0);
    });

    it('starts a fresh measurement on every send', () => {
        markChatSend();
        markChatFirstText();
        markChatFinish();
        markChatSend();
        markChatFirstText();
        expect(measures('syd-chat:ttft')).toHaveLength(2);
    });
});
