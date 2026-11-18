import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JARVIS_VOICE_PACK, getSelectedVoiceId, setSelectedVoiceId, getSelectedVoiceProfile } from '../src/workspace/jarvis/voice/jarvis-voice-pack';
import { JarvisVoiceAgent, parseVolumeRequest, isWeatherRequest, weatherPlace, placeReply, fetchWeather, type VolumeRequest } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

describe('Kevo Voice Pack & Profiles', () => {
  it('loads voice pack items including all user provided voices', () => {
    assert.ok(JARVIS_VOICE_PACK.length >= 12, 'contains all voice files');
    const ids = JARVIS_VOICE_PACK.map(v => v.id);
    assert.ok(ids.includes('nath-british-calm'));
    assert.ok(ids.includes('kelvin-mwamburi'));
    assert.ok(ids.includes('burt-deep-smooth'));
    assert.ok(ids.includes('dav-movie-trailer'));
  });

  it('selects and retrieves active voice profile', () => {
    setSelectedVoiceId('burt-deep-smooth');
    const selected = getSelectedVoiceProfile();
    assert.strictEqual(selected.id, 'burt-deep-smooth');
    assert.ok(selected.filename.includes('Burt'));
    // reset to default
    setSelectedVoiceId('nath-british-calm');
  });
});

describe('JarvisVoiceAgent Intent & Action Processing', () => {
  it('handles media pause command', async () => {
    let paused = false;
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      pauseMusic: () => { paused = true; },
    });
    const res = await agent.processVoiceInput('Kevo, please pause the music');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'pause_music');
    assert.strictEqual(paused, true);
  });

  it('handles navigation command', async () => {
    let targetView = '';
    const agent = new JarvisVoiceAgent({
      switchView: (v) => { targetView = v; },
    });
    const res = await agent.processVoiceInput('Open music hub');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'navigate_music');
    assert.strictEqual(targetView, 'music');
  });

  it('handles note-taking command', async () => {
    let capturedNote = '';
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      saveQuickNote: async (text) => { capturedNote = text; },
    });
    const res = await agent.processVoiceInput('Take a note: Buy new microphone tomorrow');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'take_note');
    assert.strictEqual(capturedNote, 'Buy new microphone tomorrow');
  });

  it('handles voice music search and play command', async () => {
    let queriedSong = '';
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      searchMusic: async (q) => {
        queriedSong = q;
        return true;
      },
    });
    const res = await agent.processVoiceInput('play Wimbo wangu');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'search_play_music');
    assert.strictEqual(queriedSong, 'Wimbo wangu');
    assert.ok(res.speechReply.includes('Wimbo wangu'));
  });

  it('handles explicit search song command', async () => {
    let queriedSong = '';
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      searchMusic: async (q) => {
        queriedSong = q;
        return false;
      },
    });
    const res = await agent.processVoiceInput('search song Wimbo wangu');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'search_music');
    assert.strictEqual(queriedSong, 'Wimbo wangu');
  });

  it('handles vault note search command', async () => {
    let vaultQuery = '';
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      searchVault: async (q) => {
        vaultQuery = q;
        return `Found 1 note: DSP Notes.`;
      },
    });
    const res = await agent.processVoiceInput('search notes for audio equalizer');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'search_vault');
    assert.strictEqual(vaultQuery, 'audio equalizer');
    assert.match(res.speechReply, /DSP Notes/);
  });

  it('delegates open questions to AI conversational intelligence', async () => {
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      askAI: async (query) => `Answering: ${query}`,
    });
    const res = await agent.processVoiceInput('What is the theory of general relativity?');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'ai_conversation');
    assert.match(res.speechReply, /Answering:/);
  });

  it('answers time and date without calling the model', async () => {
    const agent = new JarvisVoiceAgent({ switchView: () => {} });
    const time = await agent.processVoiceInput('What time is it?');
    assert.equal(time.actionName, 'tell_time');
    assert.match(time.speechReply, /It is /);

    const date = await agent.processVoiceInput("Tell me today's date");
    assert.equal(date.actionName, 'tell_date');
    assert.match(date.speechReply, /Today is /);
  });

  it('opens notes via quick capture navigation', async () => {
    let opened = false;
    let view = '';
    const agent = new JarvisVoiceAgent({
      switchView: (v) => { view = v; },
      openQuickCapture: () => { opened = true; },
    });
    const res = await agent.processVoiceInput('Open my notes');
    assert.equal(res.actionName, 'navigate_notes');
    assert.equal(view, 'home');
    assert.equal(opened, true);
  });

  it('handles weather request with Open-Meteo style summary', async () => {
    let requested = '';
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      getWeather: async (loc) => {
        requested = loc || 'default';
        return 'In London it is 12 degrees, partly cloudy. Today high 15, low 8.';
      },
    });
    const res = await agent.processVoiceInput("What's the weather in London?");
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'weather');
    assert.ok(res.speechReply.includes('London'));
    assert.strictEqual(requested, 'London');
  });

  it('handles plain weather request', async () => {
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      getWeather: async () => 'In Berlin it is 8 degrees, clear sky.',
    });
    const res = await agent.processVoiceInput('tell me the weather');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'weather');
    assert.ok(res.speechReply.includes('Berlin'));
  });
});

describe('Kevo music volume', () => {
  it('reads whole volume requests and nothing inside other words', () => {
    assert.deepEqual(parseVolumeRequest('turn it up'), { kind: 'up' });
    assert.deepEqual(parseVolumeRequest('turn the music up a bit'), { kind: 'up' });
    assert.deepEqual(parseVolumeRequest('louder.'), { kind: 'up' });
    assert.deepEqual(parseVolumeRequest('volume down'), { kind: 'down' });
    assert.deepEqual(parseVolumeRequest('make it quieter'), { kind: 'down' });
    assert.deepEqual(parseVolumeRequest('mute'), { kind: 'mute' });
    assert.deepEqual(parseVolumeRequest('mute the music'), { kind: 'mute' });
    assert.deepEqual(parseVolumeRequest('unmute'), { kind: 'unmute' });
    assert.deepEqual(parseVolumeRequest('set the volume to 40'), { kind: 'set', level: 40 });
    assert.deepEqual(parseVolumeRequest('set the music volume to 25 percent'), { kind: 'set', level: 25 });
    assert.deepEqual(parseVolumeRequest('volume 150'), { kind: 'set', level: 100 });
    // Said politely, the way people ask (review of the first version).
    assert.deepEqual(parseVolumeRequest('can you turn the volume up'), { kind: 'up' });
    assert.deepEqual(parseVolumeRequest('please mute'), { kind: 'mute' });
    assert.deepEqual(parseVolumeRequest('turn it up please'), { kind: 'up' });
    assert.deepEqual(parseVolumeRequest('mute the music please'), { kind: 'mute' });
    assert.deepEqual(parseVolumeRequest('turn it down a little bit'), { kind: 'down' });
    assert.deepEqual(parseVolumeRequest('turn the volume up to 40'), { kind: 'set', level: 40 });
    for (const not of ['i have a long commute', 'commute', 'how loud is a jet engine', 'turn up the heat', 'what is volume in physics', 'mute my microphone', 'silence is golden']) {
      assert.equal(parseVolumeRequest(not), null, not);
    }
  });

  it('changes the music volume and says the new level', async () => {
    const asked: VolumeRequest[] = [];
    let level = 70;
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      setMusicVolume: (change) => {
        asked.push(change);
        if (change.kind === 'set') level = change.level;
        if (change.kind === 'up') level += 10;
        return level;
      },
    });
    assert.deepEqual(await agent.processVoiceInput('Kevo, turn it up.'), { handled: true, actionName: 'volume_up', speechReply: 'Music volume 80 percent.' });
    assert.equal((await agent.processVoiceInput('Set the volume to 30.')).speechReply, 'Music volume 30 percent.');
    assert.equal((await agent.processVoiceInput('Mute.')).actionName, 'volume_mute');
    assert.deepEqual(asked.map((c) => c.kind), ['up', 'set', 'mute']);
  });

  it('leaves "commute" to the AI', async () => {
    let muted = false;
    let asked = '';
    const agent = new JarvisVoiceAgent({ switchView: () => {}, setMusicVolume: () => { muted = true; return 0; }, askAI: async (q) => { asked = q; return 'ok'; } });
    await agent.processVoiceInput('How long is my commute to Evansville?');
    assert.equal(muted, false);
    assert.match(asked, /commute/);
  });
});

describe('Kevo weather', () => {
  it('tells weather requests from the Weather app and songs', () => {
    for (const yes of ["what's the weather", 'how is the weather in nairobi today', 'weather in haubstadt', 'tell me the weather', 'check the weather for new york']) assert.ok(isWeatherRequest(yes), yes);
    for (const yes of ["what’s the weather like in paris", 'can you tell me the weather please', "what's the weather tomorrow in nairobi", 'weather']) assert.ok(isWeatherRequest(yes), yes);
    for (const no of ['open weather', 'play stormy weather', 'open the weather app', 'search weather radar', 'what is the difference between weather and climate', 'tell me about weather patterns in kenya', "what's the weather like in paris in july"]) assert.ok(!isWeatherRequest(no), no);
  });

  it('finds the place as said', () => {
    assert.equal(weatherPlace("What's the weather in London?"), 'London');
    assert.equal(weatherPlace("How's the weather like in New York today"), 'New York');
    assert.equal(weatherPlace('weather for Haubstadt, Indiana'), 'Haubstadt, Indiana');
    assert.equal(weatherPlace("What's the weather"), undefined);
  });

  it('asks which city when there is no place yet, and takes the answer', async () => {
    const places: (string | undefined)[] = [];
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      getWeather: async (place) => { places.push(place); return place ? `In ${place} it is 50 degrees and clear.` : null; },
    });
    const first = await agent.processVoiceInput("What's the weather?");
    assert.equal(first.actionName, 'weather_needs_place');
    assert.match(first.speechReply, /Which city/);
    const second = await agent.processVoiceInput('Nairobi.');
    assert.equal(second.actionName, 'weather');
    assert.deepEqual(places, [undefined, 'Nairobi']);
  });

  it('takes only a place name as the answer to "Which city?"', () => {
    assert.equal(placeReply('Nairobi.'), 'Nairobi');
    assert.equal(placeReply('in New York'), 'New York');
    for (const no of ['tell me a joke', 'who is the president', 'no never mind', 'open Spotify', 'set a timer for 5 minutes']) assert.equal(placeReply(no), undefined, no);
  });

  it('asks for tomorrow when tomorrow is said', async () => {
    const days: (number | undefined)[] = [];
    const agent = new JarvisVoiceAgent({ switchView: () => {}, getWeather: async (place, day) => { days.push(day); return `Tomorrow in ${place}: clear, high 70, low 50.`; } });
    assert.equal((await agent.processVoiceInput("What's the weather tomorrow in Nairobi?")).actionName, 'weather');
    assert.deepEqual(days, [1]);
  });

  it('gives tomorrow from the daily forecast', async () => {
    const fetchFn = async (url: string) => ({ ok: true, status: 200, json: async () => url.includes('geocoding')
      ? { results: [{ latitude: -1.29, longitude: 36.82, name: 'Nairobi' }] }
      : { current: { temperature_2m: 20 }, daily: { weather_code: [0, 61], temperature_2m_max: [25, 23.6], temperature_2m_min: [13, 14.2] } } });
    assert.equal(await fetchWeather('Nairobi', { day: 1, fetchFn }), 'Tomorrow in Nairobi: raining, high 24, low 14.');
  });

  it('says plainly when the weather service cannot be reached', async () => {
    const fetchFn = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(fetchWeather('Nairobi', { fetchFn }), /did not answer\. Check the internet connection/);
  });

  it('builds one spoken line from Open-Meteo, in Fahrenheit for US English', async () => {
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      const body = url.includes('geocoding')
        ? { results: [{ latitude: 38.2, longitude: -87.57, name: 'Haubstadt' }] }
        : { current: { temperature_2m: 48.6, weather_code: 61, wind_speed_10m: 9.4 }, daily: { temperature_2m_max: [52.1], temperature_2m_min: [39.8] } };
      return { ok: true, status: 200, json: async () => body };
    };
    const line = await fetchWeather('Haubstadt', { fahrenheit: true, fetchFn });
    assert.equal(line, "In Haubstadt it is 49 degrees and raining. Today's high is 52, low 40. Wind 9 miles per hour.");
    assert.match(urls[0], /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?name=Haubstadt&/);
    assert.match(urls[1], /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=38\.2&longitude=-87\.57&.*temperature_unit=fahrenheit/);
  });

  it('says so when the place is unknown, instead of another city\'s weather', async () => {
    let calls = 0;
    const fetchFn = async () => { calls++; return { ok: true, status: 200, json: async () => ({}) }; };
    await assert.rejects(fetchWeather('Nowhereville', { fetchFn }), /could not find a place called Nowhereville/);
    assert.equal(calls, 1);
  });
});
