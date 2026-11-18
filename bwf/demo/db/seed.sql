-- Tokens: demo-alice (admin, org o1), demo-bob (member, org o1), demo-grace (member, org o2)
INSERT INTO api_tokens (hash, user_id, org_id, role) VALUES
  ('c3fe0b469a6d4f19a25fbec114762d2186aa2c22888f52c5550a77fc104bcff3', 'u-alice', 'o1', 'admin'),
  ('cfdd601be826835d6a59c993254eb5786da08ee32379b680795ebe708f0060f9', 'u-bob', 'o1', 'member'),
  ('6a55f5113d97dc2504262d5e029e3acf0a7fa220f0f76ca8af6fa5ff8ea2c571', 'u-grace', 'o2', 'member');
INSERT INTO contacts (id, org_id, name, email, created_at) VALUES
  ('c1', 'o1', 'Ada Lovelace', 'ada@example.com', 1700000000000),
  ('c2', 'o1', 'Alan Turing', 'alan@example.com', 1700000000000),
  ('c3', 'o2', 'Grace Hopper', 'grace@example.com', 1700000000000);
