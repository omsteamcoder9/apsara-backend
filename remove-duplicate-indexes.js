import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const removeDuplicateIndexes = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const collection = mongoose.connection.collection('users');
    
    // Get all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key })));
    
    // Drop phoneNumber index (both will be removed)
    try {
      await collection.dropIndex('phoneNumber_1');
      console.log('✅ Dropped phoneNumber_1 index');
    } catch (err) {
      console.log('phoneNumber_1 index not found or already dropped');
    }
    
    // Drop email index (both will be removed)
    try {
      await collection.dropIndex('email_1');
      console.log('✅ Dropped email_1 index');
    } catch (err) {
      console.log('email_1 index not found or already dropped');
    }
    
    // Let mongoose recreate clean indexes
    console.log('✓ All duplicate indexes removed');
    console.log('✓ Restart your server to recreate clean indexes');
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

removeDuplicateIndexes();