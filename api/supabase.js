export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY, TABLE_NAME } = process.env;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TABLE_NAME) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  // GET - Fetch all rows
  if (req.method === 'GET') {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const data = await response.json();
    return res.status(200).json(data);
  }

  // POST - Edit row
  if (req.method === 'POST' && req.body.action === 'edit') {
    const { id, data } = req.body;
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(400).json({ error });
    }

    return res.status(200).json({ success: true });
  }

  // DELETE - Delete row
  if (req.method === 'DELETE') {
    const { id } = req.body;
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(400).json({ error });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid request' });
}
