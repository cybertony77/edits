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
          value = value.replace(/^"|"$/g, ''); // remove quotes
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
async function addCourseTypeToAllStudents() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const students = db.collection('students');

    // Update all documents to have courseType: "basics"
    const result = await students.updateMany(
      {},
      { $set: { courseType: "basics" } }
    );

    console.log(`🎉 Done! Updated all students with courseType: "basics"`);
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.close();
  }
}

addCourseTypeToAllStudents();
