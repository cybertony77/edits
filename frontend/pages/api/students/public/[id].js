import { MongoClient } from 'mongodb';
import { verifySignature } from '../../../../lib/hmac';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'mr-ahmad-badr';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id } = req.query;
  const { sig } = req.query;

  // Verify HMAC signature
  if (!verifySignature(id, sig)) {
    console.log('❌ Public API: Invalid HMAC signature');
    return res.status(401).json({ message: 'Invalid signature' });
  }

  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    const studentsCollection = db.collection('students');

    let student;
    
    // Try to find by numeric ID first
    if (/^\d+$/.test(id)) {
      student = await studentsCollection.findOne({ id: parseInt(id) });
    }
    
    // If not found by numeric ID, try by MongoDB ObjectId
    if (!student) {
      try {
        const { ObjectId } = require('mongodb');
        student = await studentsCollection.findOne({ _id: new ObjectId(id) });
      } catch (error) {
        console.log('❌ Invalid ObjectId format:', id);
      }
    }

    if (!student) {
      console.log('❌ Public API: Student not found:', id);
      return res.status(404).json({ message: 'Student not found' });
    }

    console.log('✅ Public API: Student found:', { id: student.id, name: student.name });
    
    await client.close();
    return res.status(200).json(student);
  } catch (error) {
    console.error('❌ Public API: Database error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}