const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Load environment variables
function loadEnvConfig() {
  try {
    const envPath = path.join(__dirname, '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, value] = trimmed.split('=');
        if (key && value) envVars[key.trim()] = value.trim().replace(/^"|"$/g, '');
      }
    });
    return envVars;
  } catch {
    console.log('⚠️  Could not read env.config, using process.env as fallback');
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/mr-ahmad-badr';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'mr-ahmad-badr';

console.log('🔗 Using Mongo URI:', MONGO_URI);

async function editStudentsId() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    console.log('📚 Connected to database successfully');

    const startOldId = 100002;
    const endOldId = 100079;
    const newIdStart = 121;

    console.log(`🔄 Updating student IDs from ${startOldId} to ${endOldId}, starting new ID from ${newIdStart}`);

    const students = await db.collection('students')
      .find({ id: { $gte: startOldId, $lte: endOldId } })
      .sort({ id: 1 })
      .toArray();

    console.log(`📋 Found ${students.length} students to update`);
    if (students.length === 0) {
      console.log('⚠️  No students found in the specified range');
      return;
    }

    // Use for..of with await to handle async updates properly
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const newId = newIdStart + i;
      await db.collection('students').updateOne(
        { _id: student._id },
        { $set: { id: newId } }
      );
      console.log(`✅ Updated student ${student.id} → ${newId}`);
    }

    console.log(`🎉 Successfully updated ${students.length} student IDs`);
  } catch (error) {
    console.error('❌ Error updating student IDs:', error);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed');
  }
}

editStudentsId();
