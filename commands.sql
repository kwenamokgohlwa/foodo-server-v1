-- Create a new table
create table users (
  id text primary key,
  email text,
  name text
);

create table todos (
 id text primary key,
 title text,
 complete boolean,
 owner text,
 CONSTRAINT fk_owner FOREIGN KEY(owner) REFERENCES users(id)
);

-- Create a new item
--INSERT INTO todos VALUES ('1', 'My first Foodo', false);

-- Delete an item
--delete from todos where id = '001'

-- Update item
--UPDATE todos SET title = 'Updated title', content = 'Updated content'  where id = '001'

-- Query all items
select * from todos;