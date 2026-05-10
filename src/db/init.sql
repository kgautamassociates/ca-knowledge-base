-- ═══════════════════════════════════════════════════
--  CA Knowledge Base — Database Schema
--  Kanhaiya Gautam & Associates
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entries (
    id VARCHAR(100) PRIMARY KEY,
    act VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'section',
    chapter VARCHAR(255) DEFAULT '',
    number VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    sub TEXT DEFAULT '',
    content TEXT DEFAULT '',
    links JSONB DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    created_by VARCHAR(100) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    entry_id VARCHAR(100) NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entry_id, user_id)
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_entries_act ON entries(act);
CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
CREATE INDEX IF NOT EXISTS idx_entries_chapter ON entries(chapter);
CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_search ON entries USING gin(to_tsvector('english', title || ' ' || number || ' ' || sub || ' ' || content));
CREATE INDEX IF NOT EXISTS idx_notes_entry ON notes(entry_id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);

-- Full text search function
CREATE OR REPLACE FUNCTION search_entries(query TEXT)
RETURNS SETOF entries AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM entries
    WHERE to_tsvector('english', title || ' ' || number || ' ' || COALESCE(sub,'') || ' ' || COALESCE(content,''))
          @@ plainto_tsquery('english', query)
    ORDER BY ts_rank(
        to_tsvector('english', title || ' ' || number || ' ' || COALESCE(sub,'') || ' ' || COALESCE(content,'')),
        plainto_tsquery('english', query)
    ) DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Default settings
INSERT INTO settings (key, value) VALUES
('acts', '["CGST Act, 2017","IGST Act, 2017","SGST Act","GST Rules","Income Tax Act, 1961","Income Tax Act, 2025","Income Tax Rules","Companies Act, 2013","Companies Rules","FEMA","GST Compensation Act","LLP Act, 2008","Insolvency & Bankruptcy Code, 2016","Indian Contract Act","Negotiable Instruments Act","Cost Audit Rules"]'::jsonb),
('types', '["section","rule","notification","circular","caselaw","illustration","example","chart","press release","article","form","amendment","schedule","proviso","explanation","order","other"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
