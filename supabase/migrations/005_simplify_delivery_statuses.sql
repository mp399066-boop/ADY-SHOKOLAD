-- Simplify delivery statuses to: 'נאסף' (collected) and 'נמסר' (delivered)

-- Step 1: migrate all non-delivered rows to 'נאסף'
UPDATE משלוחים SET סטטוס_משלוח = 'נאסף' WHERE סטטוס_משלוח <> 'נמסר';

-- Step 2: drop old check constraint (auto-named by PostgreSQL)
ALTER TABLE משלוחים DROP CONSTRAINT IF EXISTS משלוחים_סטטוס_משלוח_check;

-- Step 3: update column default
ALTER TABLE משלוחים ALTER COLUMN סטטוס_משלוח SET DEFAULT 'נאסף';

-- Step 4: add new simple constraint
ALTER TABLE משלוחים ADD CONSTRAINT משלוחים_סטטוס_משלוח_check
  CHECK (סטטוס_משלוח IN ('נאסף', 'נמסר'));
