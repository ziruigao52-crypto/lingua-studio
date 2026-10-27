export async function onRequest(context) {
  const url = new URL(context.request.url);
  const videoId = url.searchParams.get('v');

  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Missing video ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const listRes = await fetch(`https://video.google.com/timedtext?type=list&v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    const listXml = await listRes.text();

    const langMatches = [...listXml.matchAll(/lang_code="([^"]+)"/g)];
    const langs = langMatches.map(m => m[1]);

    if (langs.length === 0) {
      return new Response(JSON.stringify({ error: 'No captions found for this video' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const targetLang = langs.find(l => l.startsWith('en')) || langs[0];

    const transcriptRes = await fetch(`https://video.google.com/timedtext?lang=${targetLang}&v=${videoId}&fmt=json3`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!transcriptRes.ok) {
      throw new Error('Failed to download transcript track');
    }

    const transcriptJson = await transcriptRes.json();

    return new Response(JSON.stringify(transcriptJson), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch transcript' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}