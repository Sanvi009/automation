export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return res.status(500).json({
            status: '❌ FAILED',
            message: 'Environment variables missing',
            url: SUPABASE_URL ? '✅' : '❌',
            key: SUPABASE_ANON_KEY ? '✅' : '❌'
        });
    }

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/videos?limit=1`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });

        if (!response.ok) {
            throw new Error(`Supabase returned: ${response.status}`);
        }

        const data = await response.json();

        return res.status(200).json({
            status: '✅ SUCCESS',
            message: 'Connected to Supabase!',
            count: data.length,
            url: SUPABASE_URL,
            key: SUPABASE_ANON_KEY ? '✅ Present' : '❌ Missing'
        });

    } catch (error) {
        return res.status(500).json({
            status: '❌ FAILED',
            message: error.message,
            url: SUPABASE_URL,
            key: SUPABASE_ANON_KEY ? '✅ Present' : '❌ Missing'
        });
    }
}
