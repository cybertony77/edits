import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';

// Load environment variables from env.config
function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
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
const JWT_SECRET = envConfig.JWT_SECRET || process.env.JWT_SECRET || 'topphysics_secret';
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'topphysics';

console.log('🔗 Using Mongo URI:', MONGO_URI);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { studentId, examIndex, examDegree, outOf, percentage } = req.body;
  
  // Validate required fields
  if (!studentId || examIndex === undefined || !examDegree || !outOf || percentage === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Validate exam index (0-9)
  if (examIndex < 0 || examIndex > 9) {
    return res.status(400).json({ error: 'Exam index must be between 0 and 9' });
  }
  
  // Validate exam degree and outOf
  if (examDegree < 0 || outOf <= 0 || examDegree > outOf) {
    return res.status(400).json({ error: 'Invalid exam degree or out of value' });
  }
  
  console.log('📝 Saving mock exam for student:', studentId, 'exam:', examIndex + 1);
  console.log('📊 Exam data:', { examDegree, outOf, percentage });
  
  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    
    // Verify authentication
    const user = await authMiddleware(req);
    console.log('✅ Authentication successful for user:', user.assistant_id);
    
    // Get the student data first
    const student = await db.collection('students').findOne({ id: parseInt(studentId) });
    if (!student) {
      console.log('❌ Student not found:', studentId);
      return res.status(404).json({ error: 'Student not found' });
    }
    console.log('✅ Found student:', student.name);
    
    // Check if student account is deactivated
    if (student.account_state === 'Deactivated') {
      console.log('❌ Student account is deactivated:', studentId);
      return res.status(403).json({ error: 'Student account is deactivated' });
    }
    
    // Create date string
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const date = `${day}/${month}/${year} at ${displayHours}:${minutes} ${ampm}`;
    
    // Initialize mockExams array if it doesn't exist
    if (!student.mockExams || !Array.isArray(student.mockExams)) {
      // Create array with proper default objects
      const defaultMockExams = Array(10).fill(null).map(() => ({
        examDegree: null,
        outOf: null,
        percentage: null,
        date: null
      }));
      
      // First, update the database to initialize the mockExams array
      await db.collection('students').updateOne(
        { id: parseInt(studentId) },
        { 
          $set: { 
            mockExams: defaultMockExams
          } 
        }
      );
      // Update local reference
      student.mockExams = defaultMockExams;
    }
    
    // Update the specific exam data
    const examData = {
      examDegree: examDegree,
      outOf: outOf,
      percentage: percentage,
      date: date
    };
    
    // Update the student document
    const result = await db.collection('students').updateOne(
      { id: parseInt(studentId) },
      { 
        $set: { 
          [`mockExams.${examIndex}`]: examData
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      console.log('❌ Failed to update student:', studentId);
      return res.status(404).json({ error: 'Student not found' });
    }
    
    console.log('✅ Mock exam saved successfully for student:', studentId, 'exam:', examIndex + 1);
    
    res.json({ 
      success: true, 
      message: 'Mock exam saved successfully',
      examData: examData
    });
    
  } catch (error) {
    console.error('❌ Error in mock exam endpoint:', error);
    if (error.message.includes('Unauthorized') || error.message.includes('Invalid token')) {
      res.status(401).json({ error: error.message });
    } else {
      console.error('Error saving mock exam:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    if (client) await client.close();
  }
}
