// seeder.js
// Run: node seeder.js
import bcrypt from 'bcryptjs';
import { initDB } from './app.js';
import User from './models/userModel.js';

const seed = async () => {
  try {
    await initDB();

    console.log('Seeding users...');

    // Remove existing sample accounts that we will re-create (be careful in prod!)
    const emails = [
      'admin1@example.com',
      'admin@gmail.com',  // ✅ Added your admin email
      // some user-panel users
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
      'ajayrav516@gmail.com'
    ];

    await User.deleteMany({ email: { $in: emails } });

    const plain = [
      // ✅ ADMIN USER - Use your credentials
      { 
        name: 'Admin', 
        email: 'admin@gmail.com', 
        role: 'admin', 
        password: 'admin123'  // ✅ Your admin password from .env
      },

      // Admin One (sample)
      { 
        name: 'Admin One', 
        email: 'admin1@example.com', 
        role: 'admin', 
        password: 'Admin123!' 
      },

      // user-panel users
      { 
        name: 'Alice User', 
        email: 'alice@example.com', 
        role: 'user', 
        password: 'AlicePass1' 
      },
      { 
        name: 'Bob User', 
        email: 'bob@example.com', 
        role: 'user', 
        password: 'BobPass1' 
      },
      { 
        name: 'Carol User', 
        email: 'carol@example.com', 
        role: 'user', 
        password: 'CarolPass1' 
      },
      { 
        name: 'Ajay User', 
        email: 'ajayrav516@gmail.com', 
        role: 'user', 
        password: 'ajay123' 
      },
    ];

    for (const u of plain) {
      const hash = await bcrypt.hash(u.password, 10);
      await User.create({
        name: u.name,
        email: u.email,
        password: hash,
        role: u.role,
        active: true,
        isAdmin: u.role === 'admin'  // ✅ Set isAdmin for admin users
      });
      console.log(`✅ Created ${u.email} (${u.role})`);
    }

    console.log('✅ Seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding error', err);
    process.exit(1);
  }
};

seed();