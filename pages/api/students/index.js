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
    console.log('📋 Students API called - optimizing for large datasets...');
    
    // Validate environment variables
    if (!MONGO_URI || !DB_NAME || !JWT_SECRET) {
      console.error('❌ Missing environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error', 
        details: 'Missing required environment variables'
      });
    }

    console.log('🔗 Connecting to MongoDB...');
    client = await MongoClient.connect(MONGO_URI);
    db = client.db(DB_NAME);
    console.log('✅ Connected to database:', DB_NAME);
    
    // Verify authentication
    console.log('🔐 Authenticating user...');
    const user = await authMiddleware(req);
    console.log('✅ User authenticated:', user.assistant_id || user.id);
    
    if (req.method === 'GET') {
      // Check if pagination parameters are provided
      const { page, limit, search, grade, center, sortBy, sortOrder } = req.query;
      const hasPagination = page || limit;
      
      if (hasPagination) {
        // Paginated response for large datasets
        console.log('📊 Building paginated response...');
        
        // Parse pagination parameters
        const currentPage = parseInt(page) || 1;
        const pageSize = parseInt(limit) || 50;
        const searchTerm = search ? search.trim() : '';
        const gradeFilter = grade ? grade.trim() : '';
        const centerFilter = center ? center.trim() : '';
        const sortField = sortBy || 'id';
        const sortDirection = sortOrder === 'desc' ? -1 : 1;
        
        console.log('📋 Pagination params:', { currentPage, pageSize, searchTerm, gradeFilter, centerFilter, sortField, sortDirection });
        
        // Build query filter
        const queryFilter = {};
        
        if (searchTerm) {
          queryFilter.$or = [
            { name: { $regex: searchTerm, $options: 'i' } },
            { school: { $regex: searchTerm, $options: 'i' } },
            { phone: { $regex: searchTerm, $options: 'i' } },
            { parentsPhone: { $regex: searchTerm, $options: 'i' } },
            { id: isNaN(searchTerm) ? null : parseInt(searchTerm) }
          ].filter(condition => condition.id !== null || Object.keys(condition).length > 1);
        }
        
        if (gradeFilter) {
          queryFilter.grade = { $regex: gradeFilter, $options: 'i' };
        }
        
        if (centerFilter) {
          queryFilter.main_center = { $regex: centerFilter, $options: 'i' };
        }
        
        console.log('🔍 Query filter:', JSON.stringify(queryFilter, null, 2));
        
        // Get total count for pagination
        const totalCount = await db.collection('students').countDocuments(queryFilter);
        const totalPages = Math.ceil(totalCount / pageSize);
        const skip = (currentPage - 1) * pageSize;
        
        console.log(`📊 Found ${totalCount} students matching filters`);
        console.log(`📄 Page ${currentPage} of ${totalPages} (${pageSize} per page)`);
        
        // Get students with projection for better performance
        const students = await db.collection('students')
          .find(queryFilter, {
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
              account_state: 1,
              weeks: 1
            }
          })
          .sort({ [sortField]: sortDirection })
          .skip(skip)
          .limit(pageSize)
          .toArray();
        
        console.log(`✅ Retrieved ${students.length} students for page ${currentPage}`);
        
        // Process students in batches to avoid memory issues
        const batchSize = 100;
        const mappedStudents = [];
        
        for (let i = 0; i < students.length; i += batchSize) {
          const batch = students.slice(i, i + batchSize);
          
          const batchMapped = batch.map(student => {
            // Find the current week (last attended week or week 1 if none)
            const hasWeeks = Array.isArray(student.weeks) && student.weeks.length > 0;
            const currentWeek = hasWeeks ?
              (student.weeks.find(w => w && w.attended) || student.weeks.find(w => w) || student.weeks[0]) :
              { week: 1, attended: false, lastAttendance: null, lastAttendanceCenter: null, hwDone: false, quizDegree: null, message_state: false };
            
            // Robust null checks for currentWeek
            const safeCurrentWeek = currentWeek || { 
              week: 1, 
              attended: false, 
              lastAttendance: null, 
              lastAttendanceCenter: null, 
              hwDone: false, 
              quizDegree: null, 
              message_state: false 
            };
            
            return {
              id: student.id,
              name: student.name,
              grade: student.grade,
              phone: student.phone,
              parents_phone: student.parentsPhone,
              center: student.center,
              main_center: student.main_center,
              main_comment: (student.main_comment ?? student.comment ?? null),
              attended_the_session: safeCurrentWeek.attended || false,
              lastAttendance: safeCurrentWeek.lastAttendance || null,
              lastAttendanceCenter: safeCurrentWeek.lastAttendanceCenter || null,
              attendanceWeek: `week ${String(safeCurrentWeek.week || 1).padStart(2, '0')}`,
              hwDone: safeCurrentWeek.hwDone || false,
              quizDegree: safeCurrentWeek.quizDegree || null,
              school: student.school || null,
              age: student.age || null,
              message_state: safeCurrentWeek.message_state || false,
              account_state: student.account_state || "Activated",
              weeks: student.weeks || []
            };
          });
          
          mappedStudents.push(...batchMapped);
        }
        
        console.log(`📈 Returning ${mappedStudents.length} students for page ${currentPage}`);
        
        res.json({
          data: mappedStudents,
          pagination: {
            currentPage,
            pageSize,
            totalCount,
            totalPages,
            hasNextPage: currentPage < totalPages,
            hasPrevPage: currentPage > 1
          },
          filters: {
            search: searchTerm,
            grade: gradeFilter,
            center: centerFilter,
            sortBy: sortField,
            sortOrder: sortDirection === 1 ? 'asc' : 'desc'
          }
        });
        
      } else {
        // Original format for backward compatibility (optimized)
        console.log('📊 Building original format response (optimized)...');
        
        // Get all students with projection for better performance
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
            account_state: 1,
            weeks: 1
          }
        }).toArray();
        
        console.log(`📊 Found ${students.length} students`);
        
        // Process students in batches to avoid memory issues
        const batchSize = 100;
        const mappedStudents = [];
        
        for (let i = 0; i < students.length; i += batchSize) {
          const batch = students.slice(i, i + batchSize);
          
          const batchMapped = batch.map(student => {
            // Find the current week (last attended week or week 1 if none)
            const hasWeeks = Array.isArray(student.weeks) && student.weeks.length > 0;
            const currentWeek = hasWeeks ?
              (student.weeks.find(w => w && w.attended) || student.weeks.find(w => w) || student.weeks[0]) :
              { week: 1, attended: false, lastAttendance: null, lastAttendanceCenter: null, hwDone: false, quizDegree: null, message_state: false };
            
            // Robust null checks for currentWeek
            const safeCurrentWeek = currentWeek || { 
              week: 1, 
              attended: false, 
              lastAttendance: null, 
              lastAttendanceCenter: null, 
              hwDone: false, 
              quizDegree: null, 
              message_state: false 
            };
            
            return {
              id: student.id,
              name: student.name,
              grade: student.grade,
              phone: student.phone,
              parents_phone: student.parentsPhone,
              center: student.center,
              main_center: student.main_center,
              main_comment: (student.main_comment ?? student.comment ?? null),
              attended_the_session: safeCurrentWeek.attended || false,
              lastAttendance: safeCurrentWeek.lastAttendance || null,
              lastAttendanceCenter: safeCurrentWeek.lastAttendanceCenter || null,
              attendanceWeek: `week ${String(safeCurrentWeek.week || 1).padStart(2, '0')}`,
              hwDone: safeCurrentWeek.hwDone || false,
              quizDegree: safeCurrentWeek.quizDegree || null,
              school: student.school || null,
              age: student.age || null,
              message_state: safeCurrentWeek.message_state || false,
              account_state: student.account_state || "Activated",
              weeks: student.weeks || []
            };
          });
          
          mappedStudents.push(...batchMapped);
        }
        
        console.log(`📈 Returning ${mappedStudents.length} students in original format`);
        res.json(mappedStudents);
      }
    } else if (req.method === 'POST') {
      // Add new student
      const { id, name, grade, phone, parents_phone, main_center, age, school, main_comment, comment, account_state } = req.body;
      if (!id || !name || !grade || !phone || !parents_phone || !main_center || age === undefined || !school) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      
      // Check if the custom ID is already used
      const existingStudent = await db.collection('students').findOne({ id: parseInt(id) });
      if (existingStudent) {
        return res.status(400).json({ error: 'This ID is used, please use another ID' });
      }
      
      const newId = parseInt(id);
      
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
        account_state: account_state || "Activated", // Default to Activated
        weeks: weeks
      };
      await db.collection('students').insertOne(student);
      res.json({ id: newId });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('❌ Students API error:', error);
    
    if (error.message.includes('Unauthorized') || error.message.includes('Invalid token')) {
      return res.status(401).json({ error: error.message });
    }
    
    if (error.message === 'No token provided') {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch student data', 
      details: error.message 
    });
  } finally {
    if (client) await client.close();
  }
} 