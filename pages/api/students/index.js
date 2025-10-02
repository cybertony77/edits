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

// Auth middleware is now imported from shared utility

export default async function handler(req, res) {
  let client;
  let db;
  try {
    console.log('🚀 Students API called:', { method: req.method, url: req.url });
    console.log('📁 Current working directory:', process.cwd());
    
    // Validate environment variables
    console.log('🔧 Environment variables check:', { 
      MONGO_URI: !!MONGO_URI, 
      DB_NAME: !!DB_NAME, 
      JWT_SECRET: !!JWT_SECRET,
      MONGO_URI_VALUE: MONGO_URI ? `${MONGO_URI.substring(0, 20)}...` : 'undefined',
      DB_NAME_VALUE: DB_NAME || 'undefined'
    });
    
    if (!MONGO_URI || !DB_NAME || !JWT_SECRET) {
      console.error('❌ Missing environment variables:', { 
        MONGO_URI: !!MONGO_URI, 
        DB_NAME: !!DB_NAME, 
        JWT_SECRET: !!JWT_SECRET 
      });
      return res.status(500).json({ 
        error: 'Server configuration error', 
        details: 'Missing required environment variables',
        missing: {
          MONGO_URI: !MONGO_URI,
          DB_NAME: !DB_NAME,
          JWT_SECRET: !JWT_SECRET
        }
      });
    }

    console.log('🔗 Connecting to MongoDB...');
    try {
      client = await MongoClient.connect(MONGO_URI);
      db = client.db(DB_NAME);
      console.log('✅ Connected to database:', DB_NAME);
    } catch (dbError) {
      console.error('❌ MongoDB connection failed:', dbError);
      return res.status(500).json({ 
        error: 'Database connection failed', 
        details: dbError.message 
      });
    }
    
    // Verify authentication
    console.log('🔐 Authenticating user...');
    try {
      const user = await authMiddleware(req);
      console.log('✅ User authenticated:', user.assistant_id || user.id);
    } catch (authError) {
      console.error('❌ Authentication failed:', authError);
      return res.status(401).json({ 
        error: 'Authentication failed', 
        details: authError.message 
      });
    }
    
    if (req.method === 'GET') {
      // Get students with optimized query for large datasets
      console.log('📋 Fetching students from database...');
      
      // Check if pagination parameters are provided
      const hasPagination = req.query.page || req.query.limit;
      
      if (hasPagination) {
        // Paginated response
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        const grade = req.query.grade || '';
        const center = req.query.center || '';
        const sortBy = req.query.sortBy || 'id';
        const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
        
        const skip = (page - 1) * limit;
        
        console.log(`📊 Pagination: page=${page}, limit=${limit}, skip=${skip}`);
        
        try {
          // Build query filter
          let queryFilter = {};
          
          if (search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            queryFilter.$or = [
              { name: searchRegex },
              { school: searchRegex },
              { phone: searchRegex },
              { parentsPhone: searchRegex },
              { id: isNaN(search) ? null : parseInt(search) }
            ].filter(Boolean);
          }
          
          if (grade) {
            queryFilter.grade = { $regex: new RegExp(`^${grade}$`, 'i') };
          }
          
          if (center) {
            queryFilter.main_center = { $regex: new RegExp(`^${center}$`, 'i') };
          }
          
          const totalCount = await db.collection('students').countDocuments(queryFilter);
          const totalPages = Math.ceil(totalCount / limit);
          
          const students = await db.collection('students').find(queryFilter, {
            projection: {
              id: 1, name: 1, grade: 1, phone: 1, parentsPhone: 1,
              center: 1, main_center: 1, main_comment: 1, comment: 1,
              school: 1, age: 1, weeks: 1
            }
          })
          .sort({ [sortBy]: sortOrder })
          .skip(skip)
          .limit(limit)
          .toArray();
          
          // Process students in batches
          const batchSize = 100;
          const mappedStudents = [];
          
          for (let i = 0; i < students.length; i += batchSize) {
            const batch = students.slice(i, i + batchSize);
            const processedBatch = batch.map(student => {
              try {
                const hasWeeks = Array.isArray(student.weeks) && student.weeks.length > 0;
                let currentWeek;
                
                if (hasWeeks) {
                  const attendedWeek = student.weeks.find(w => w && w.attended);
                  currentWeek = attendedWeek || student.weeks[0];
                } else {
                  currentWeek = { 
                    week: 1, attended: false, lastAttendance: null, 
                    lastAttendanceCenter: null, hwDone: false, 
                    quizDegree: null, message_state: false 
                  };
                }
                
                if (!currentWeek) {
                  currentWeek = { 
                    week: 1, attended: false, lastAttendance: null, 
                    lastAttendanceCenter: null, hwDone: false, 
                    quizDegree: null, message_state: false 
                  };
                }
                
                return {
                  id: student.id,
                  name: student.name,
                  grade: student.grade,
                  phone: student.phone,
                  parents_phone: student.parentsPhone,
                  center: student.center,
                  main_center: student.main_center,
                  main_comment: (student.main_comment ?? student.comment ?? null),
                  attended_the_session: currentWeek.attended || false,
                  lastAttendance: currentWeek.lastAttendance || null,
                  lastAttendanceCenter: currentWeek.lastAttendanceCenter || null,
                  attendanceWeek: `week ${String(currentWeek.week || 1).padStart(2, '0')}`,
                  hwDone: currentWeek.hwDone || false,
                  quizDegree: currentWeek.quizDegree || null,
                  school: student.school || null,
                  age: student.age || null,
                  message_state: currentWeek.message_state || false,
                  weeks: student.weeks || []
                };
              } catch (studentError) {
                console.error(`❌ Error processing student ${student.id}:`, studentError);
                return {
                  id: student.id,
                  name: student.name || 'Unknown',
                  grade: student.grade || '',
                  phone: student.phone || '',
                  parents_phone: student.parentsPhone || '',
                  center: student.center || '',
                  main_center: student.main_center || '',
                  main_comment: (student.main_comment ?? student.comment ?? null),
                  attended_the_session: false,
                  lastAttendance: null,
                  lastAttendanceCenter: null,
                  attendanceWeek: 'week 01',
                  hwDone: false,
                  quizDegree: null,
                  school: student.school || null,
                  age: student.age || null,
                  message_state: false,
                  weeks: []
                };
              }
            });
            
            mappedStudents.push(...processedBatch);
          }
          
          const response = {
            data: mappedStudents,
            pagination: {
              currentPage: page,
              totalPages: totalPages,
              totalCount: totalCount,
              limit: limit,
              hasNextPage: page < totalPages,
              hasPrevPage: page > 1,
              nextPage: page < totalPages ? page + 1 : null,
              prevPage: page > 1 ? page - 1 : null
            },
            filters: {
              search: search,
              grade: grade,
              center: center,
              sortBy: sortBy,
              sortOrder: sortOrder === 1 ? 'asc' : 'desc'
            }
          };
          
          res.json(response);
          return;
        } catch (dbQueryError) {
          console.error('❌ Database query failed:', dbQueryError);
          return res.status(500).json({ 
            error: 'Database query failed', 
            details: dbQueryError.message 
          });
        }
      } else {
        // Original format - return all students (optimized for large datasets)
        try {
          // Use projection to only fetch needed fields for better performance
          const students = await db.collection('students').find({}, {
            projection: {
              id: 1,
              name: 1,
              grade: 1,
              phone: 1,
              parentsPhone: 1,
              center: 1,
              main_center: 1,
              main_comment: 1,
              comment: 1,
              school: 1,
              age: 1,
              weeks: 1
            }
          }).toArray();
        
          console.log(`✅ Found ${students.length} students`);
          
          // Process students in batches to avoid memory issues
          const batchSize = 100;
          const mappedStudents = [];
          
          for (let i = 0; i < students.length; i += batchSize) {
            const batch = students.slice(i, i + batchSize);
            const processedBatch = batch.map(student => {
              try {
                // Find the current week (last attended week or week 1 if none)
                const hasWeeks = Array.isArray(student.weeks) && student.weeks.length > 0;
                let currentWeek;
                
                if (hasWeeks) {
                  // Find last attended week or first week
                  const attendedWeek = student.weeks.find(w => w && w.attended);
                  currentWeek = attendedWeek || student.weeks[0];
                } else {
                  currentWeek = { 
                    week: 1, 
                    attended: false, 
                    lastAttendance: null, 
                    lastAttendanceCenter: null, 
                    hwDone: false, 
                    quizDegree: null, 
                    message_state: false 
                  };
                }
                
                // Ensure currentWeek is not null
                if (!currentWeek) {
                  currentWeek = { 
                    week: 1, 
                    attended: false, 
                    lastAttendance: null, 
                    lastAttendanceCenter: null, 
                    hwDone: false, 
                    quizDegree: null, 
                    message_state: false 
                  };
                }
                
                return {
                  id: student.id,
                  name: student.name,
                  grade: student.grade,
                  phone: student.phone,
                  parents_phone: student.parentsPhone,
                  center: student.center,
                  main_center: student.main_center,
                  main_comment: (student.main_comment ?? student.comment ?? null),
                  attended_the_session: currentWeek.attended || false,
                  lastAttendance: currentWeek.lastAttendance || null,
                  lastAttendanceCenter: currentWeek.lastAttendanceCenter || null,
                  attendanceWeek: `week ${String(currentWeek.week || 1).padStart(2, '0')}`,
                  hwDone: currentWeek.hwDone || false,
                  quizDegree: currentWeek.quizDegree || null,
                  school: student.school || null,
                  age: student.age || null,
                  message_state: currentWeek.message_state || false,
                  weeks: student.weeks || []
                };
              } catch (studentError) {
                console.error(`❌ Error processing student ${student.id}:`, studentError);
                // Return a safe default for this student
                return {
                  id: student.id,
                  name: student.name || 'Unknown',
                  grade: student.grade || '',
                  phone: student.phone || '',
                  parents_phone: student.parentsPhone || '',
                  center: student.center || '',
                  main_center: student.main_center || '',
                  main_comment: (student.main_comment ?? student.comment ?? null),
                  attended_the_session: false,
                  lastAttendance: null,
                  lastAttendanceCenter: null,
                  attendanceWeek: 'week 01',
                  hwDone: false,
                  quizDegree: null,
                  school: student.school || null,
                  age: student.age || null,
                  message_state: false,
                  weeks: []
                };
              }
            });
            
            mappedStudents.push(...processedBatch);
          }
          
          console.log(`✅ Processed ${mappedStudents.length} students successfully`);
          
          // Return original format (array of students)
          res.json(mappedStudents);
        } catch (dbQueryError) {
          console.error('❌ Database query failed:', dbQueryError);
          return res.status(500).json({ 
            error: 'Database query failed', 
            details: dbQueryError.message 
          });
        }
      }
    } else if (req.method === 'POST') {
      // Add new student
      const { name, grade, phone, parents_phone, main_center, age, school, main_comment, comment } = req.body;
      if (!name || !grade || !phone || !parents_phone || !main_center || age === undefined || !school) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      // Generate a new unique student id (max id + 1)
      const lastStudent = await db.collection('students').find().sort({ id: -1 }).limit(1).toArray();
      const newId = lastStudent.length > 0 ? lastStudent[0].id + 1 : 1;
      
      // New students start with no weeks; weeks are created on demand
      const weeks = [];
      
      const student = {
        id: newId,
        name,
        age,
        grade,
        school,
        phone,
        parentsPhone: parents_phone,
        main_center,
        main_comment: (main_comment ?? comment ?? null),
        weeks: weeks
      };
      await db.collection('students').insertOne(student);
      res.json({ id: newId });
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('❌ Students API error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (error.message === 'No token provided') {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Log more details for debugging
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      type: error.name
    });
  } finally {
    if (client) await client.close();
  }
} 