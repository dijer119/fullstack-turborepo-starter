-- Enable RLS on all tables and create permissive anon policy
-- Note: This is a personal tool. If exposed externally, strengthen policies.

ALTER TABLE industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_industries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON industries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON company_industries FOR ALL USING (true) WITH CHECK (true);
