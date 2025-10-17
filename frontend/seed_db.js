const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const { faker } = require('@faker-js/faker');

// Load environment variables from env.config
const fs = require('fs');
const path = require('path');

function loadEnvConfig() {
  try {
    const envPath = path.join(__dirname, '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};

    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, ''); // strip quotes
          envVars[key] = value;
        }
      }
    });

    return envVars;
  } catch (error) {
    console.log('⚠️  Could not read env.config, using process.env as fallback');
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI =
  envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/mr-ahmad-badr';
const DB_NAME =
  envConfig.DB_NAME || process.env.DB_NAME || 'mr-ahmad-badr';

console.log('🔗 Using Mongo URI:', MONGO_URI);

function createLessonsObject() {
  const lessonNames = [
    'If Conditions',
    'Transition Words', 
    'Parallel Structure',
    'Subject-Verb Agreement',
    'Pronoun Usage',
    'Modifier Placement',
    'Verb Tenses',
    'Punctuation Rules',
    'Redundancy and Wordiness',
    'Tone and Style'
  ];
  
  const lessons = {};
  lessonNames.forEach(lessonName => {
    lessons[lessonName] = {
      lesson: lessonName,
      attended: false,
      lastAttendance: null,
      lastAttendanceCenter: null,
      hwDone: false,
      quizDegree: null,
      comment: null,
      student_message_state: false,
      parent_message_state: false,
      homework_degree: null,
      paid: false,
    };
  });
  
  return lessons;
}

async function ensureCollectionsExist(db) {
  console.log('🔍 Checking if collections exist...');
  
  // Get list of existing collections
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(col => col.name);
  
  // Check and create students collection if it doesn't exist
  if (!collectionNames.includes('students')) {
    console.log('📚 Creating students collection...');
    await db.createCollection('students');
    console.log('✅ Students collection created');
  } else {
    console.log('✅ Students collection already exists');
  }
  
  // Check and create assistants collection if it doesn't exist
  if (!collectionNames.includes('assistants')) {
    console.log('👥 Creating assistants collection...');
    await db.createCollection('assistants');
    console.log('✅ Assistants collection created');
  } else {
    console.log('✅ Assistants collection already exists');
  }
  
  // Check and create history collection if it doesn't exist
  if (!collectionNames.includes('history')) {
    console.log('📖 Creating history collection...');
    await db.createCollection('history');
    console.log('✅ History collection created');
  } else {
    console.log('✅ History collection already exists');
  }
  
  // Check and create centers collection if it doesn't exist
  if (!collectionNames.includes('centers')) {
    console.log('🏢 Creating centers collection...');
    await db.createCollection('centers');
    console.log('✅ Centers collection created');
  } else {
    console.log('✅ Centers collection already exists');
  }
  
}

async function seedDatabase() {
  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    
    // Ensure collections exist before proceeding
    await ensureCollectionsExist(db);
    
    console.log('🗑️ Clearing existing data...');
    await db.collection('students').deleteMany({});
    await db.collection('assistants').deleteMany({});
    await db.collection('history').deleteMany({});
    await db.collection('centers').deleteMany({});
    
    console.log('✅ Database cleared');
    
    // Helper function to generate phone number in format 012 + 8 random digits
    const generatePhoneNumber = () => {
      const randomDigits = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
      return '012' + randomDigits;
    };
    
    // Create assistants with unique passwords
    const assistants = [
      {
        id: 'admin',
        name: 'Admin',
        phone: generatePhoneNumber(),
        role: 'admin',
        password: await bcrypt.hash('admin', 10),
        account_state: "Activated"
      },
      {
        id: 'tony',
        name: 'Tony Joseph',
        phone: generatePhoneNumber(),
        role: 'admin',
        password: await bcrypt.hash('tony', 10),
        account_state: "Activated"
      },
      {
        id: 'assistant1',
        name: 'Assistant 1',
        phone: generatePhoneNumber(),
        role: 'assistant',
        password: await bcrypt.hash('admin', 10),
        account_state: "Deactivated"
      },
      {
        id: 'assistant2',
        name: 'Assistant 2',
        phone: generatePhoneNumber(),
        role: 'assistant',
        password: await bcrypt.hash('admin', 10),
        account_state: "Deactivated"
      }
    ];
    
    console.log('👥 Creating assistants...');
    await db.collection('assistants').insertMany(assistants);
    console.log(`✅ Created ${assistants.length} assistants`);
    
    // Create centers collection with data from centers.js
    const centersData = [
      { id: 1, name: 'Rehab Center', createdAt: new Date() },
      { id: 2, name: 'Madinaty Center', createdAt: new Date() },
      { id: 3, name: 'Nasr City Center', createdAt: new Date() },
      { id: 4, name: 'Obour Center', createdAt: new Date() },
      { id: 5, name: 'Suez Center', createdAt: new Date() },
      { id: 6, name: 'Online', createdAt: new Date() }
    ];
    
    console.log('🏢 Creating centers...');
    await db.collection('centers').insertMany(centersData);
    console.log(`✅ Created ${centersData.length} centers`);
    
    const students = [];
    const centers = [
      'Rehab Center',
      'Madinaty Center', 
      'Nasr City Center',
      'Obour Center',
      'Suez Center',
      'Online'
    ];
    const courses = ["EST", "SAT", "ACT"];
    
    for (let i = 1; i <= 100; i++) {
      const center = centers[Math.floor(Math.random() * centers.length)];
      const lessons = {};
      
      students.push({
        id: i,
        account_state: "Activated",
        name: faker.person.fullName(),
        course: courses[Math.floor(Math.random() * courses.length)],
        school: faker.company.name() + ' School',
        phone: generatePhoneNumber(),
        parentsPhone1: generatePhoneNumber(),
        parentsPhone2: generatePhoneNumber(),
        address: faker.location.streetAddress(),
        main_center: center,
        main_comment: null,
        lessons: lessons,
        payment: {
          numberOfSessions: null,
          cost: null,
          paymentComment: null,
          date: null
        },
        mockExams: [
          { examDegree: null, outOf: null, percentage: null, date: null },
          { examDegree: null, outOf: null, percentage: null, date: null },
          { examDegree: null, outOf: null, percentage: null, date: null },
          { examDegree: null, outOf: null, percentage: null, date: null },
          { examDegree: null, outOf: null, percentage: null, date: null },
          { examDegree: null, outOf: null, percentage: null, date: null },
          { examDegree: null, outOf: null, percentage: null, date: null },
          { examDegree: null, outOf: null, percentage: null, date: null },
          { examDegree: null, outOf: null, percentage: null, date: null },
          { examDegree: null, outOf: null, percentage: null, date: null }
        ],
      });
    }
    
    console.log('👨‍🎓 Creating students...');
    await db.collection('students').insertMany(students);
    console.log(`✅ Created ${students.length} students`);
    

    
    console.log('🎉 Database seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`- ${assistants.length} assistants created`);
    console.log(`- ${students.length} students created`);
    console.log(`- ${centersData.length} centers created`);
    console.log('- History collection cleared (no initial records)');
    console.log('\n🔑 Demo Login Credentials:');
    console.log('Admin ID: admin, Password: admin');
    console.log('Tony ID: tony, Password: tony');
    console.log('Assistant 1 ID: assistant1, Password: admin');
    console.log('Assistant 2 ID: assistant2, Password: admin');
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    if (client) await client.close();
  }
}

seedDatabase();