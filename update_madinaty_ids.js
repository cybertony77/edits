const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// === Load environment variables from env.config ===
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

// === Main update function ===
async function updateStudentIds() {
  const client = new MongoClient(MONGO_URI);
  let counter = 89;

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const students = db.collection('students');

    // 🧠 exclude id = 55
    const cursor = students.find({
      main_center: "Madinaty Center",
      id: { $ne: 55 }
    });

    for await (const student of cursor) {
      await students.updateOne(
        { _id: student._id },
        { $set: { id: counter } }
      );
      console.log(`✅ Updated ${student.name} → id: ${counter}`);
      counter++;
    }

    console.log('🎉 Done updating IDs successfully (skipped id 55)!');
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.close();
  }
}

updateStudentIds();
