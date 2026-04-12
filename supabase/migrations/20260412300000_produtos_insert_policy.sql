-- Permite inserção e update de produtos pelo cliente anon (admin usa anon key)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'produtos' AND policyname = 'Inserção de produtos anon'
  ) THEN
    CREATE POLICY "Inserção de produtos anon" ON produtos FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'produtos' AND policyname = 'Update de produtos anon'
  ) THEN
    CREATE POLICY "Update de produtos anon" ON produtos FOR UPDATE USING (true);
  END IF;
END $$;
