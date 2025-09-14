-- Add feedback column to chat_messages table
ALTER TABLE chat_messages 
ADD COLUMN feedback text;

-- Add land_name column to chat_messages table  
ALTER TABLE chat_messages
ADD COLUMN land_name text;

-- Add land_name column to chat_sessions table
ALTER TABLE chat_sessions
ADD COLUMN land_name text;