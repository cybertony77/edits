const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

function loadEnvConfig() {
  try {
    const envPath = path.join(__dirname, "..", "env.config");
    const envContent = fs.readFileSync(envPath, "utf8");
    const envVars = {};
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const index = trimmed.indexOf("=");
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, "");
          envVars[key] = value;
        }
      }
    });
    return envVars;
  } catch (error) {
    console.log("⚠️  Could not read env.config, using process.env as fallback");
    return {};
  }
}

const envConfig = loadEnvConfig();
const MONGO_URI =
  envConfig.MONGO_URI ||
  process.env.MONGO_URI ||
  "mongodb://localhost:27017/topphysics";
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || "topphysics";

console.log("🔗 Using Mongo URI:", MONGO_URI);

const defaultWeek = (num) => ({
  week: num,
  attended: false,
  lastAttendance: null,
  lastAttendanceCenter: null,
  hwDone: false,
  quizDegree: null,
  comment: null,
  message_state: false,
});

function nextAvailableNumber(preferred, existingSet, assignedSet, limit = 200) {
  // prefer the preferred value if free, otherwise find smallest positive integer not used
  if (Number.isInteger(preferred) && !existingSet.has(preferred) && !assignedSet.has(preferred)) {
    return preferred;
  }
  for (let i = 1; i <= limit; i++) {
    if (!existingSet.has(i) && !assignedSet.has(i)) return i;
  }
  // fallback to preferred if nothing found (shouldn't happen)
  return preferred;
}

async function fixMissingWeeks() {
  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    const coll = db.collection("students");

    // find students with either null items in weeks OR a week object missing the "week" field
    const students = await coll.find({
      $or: [
        { "weeks": { $elemMatch: { $eq: null } } },
        { "weeks": { $elemMatch: { week: { $exists: false } } } }
      ]
    }).toArray();

    console.log(`🔍 Found ${students.length} students to check...`);

    let totalWeekEntriesFixed = 0;
    let totalStudentsFixed = 0;

    for (const student of students) {
      if (!Array.isArray(student.weeks)) continue;

      // collect already defined week numbers
      const existingNums = student.weeks
        .map(w => (w && typeof w === 'object' && Number.isInteger(w.week) ? w.week : null))
        .filter(n => n !== null);

      const existingSet = new Set(existingNums);
      const assignedSet = new Set(); // numbers we've assigned during this run for this student

      let fixedThisStudent = 0;

      const newWeeks = student.weeks.map((w, i) => {
        const pref = i + 1;

        // Case: null or not an object -> create default with best week number
        if (w === null || typeof w !== 'object') {
          const weekNum = nextAvailableNumber(pref, existingSet, assignedSet);
          assignedSet.add(weekNum);
          fixedThisStudent++;
          return defaultWeek(weekNum);
        }

        // Case: object but missing 'week' -> add week number only, keep other props
        if (typeof w === 'object' && w.week === undefined) {
          const weekNum = nextAvailableNumber(pref, existingSet, assignedSet);
          assignedSet.add(weekNum);
          fixedThisStudent++;
          return { ...w, week: weekNum };
        }

        // Case: object already has week -> keep as-is (but note duplicates)
        if (typeof w === 'object' && Number.isInteger(w.week)) {
          // if duplicate weeks exist we keep them, but ensure we register them so new assignments avoid duplicates
          assignedSet.add(w.week);
          return w;
        }

        // any other fallback (shouldn't happen)
        return w;
      });

      if (fixedThisStudent > 0) {
        await coll.updateOne({ _id: student._id }, { $set: { weeks: newWeeks } });
        console.log(`✅ Fixed "${student.name}" (id: ${student.id}) — entries fixed: ${fixedThisStudent}`);
        totalWeekEntriesFixed += fixedThisStudent;
        totalStudentsFixed++;
      }
    }

    console.log(`\n🎉 Done! ${totalStudentsFixed} students updated, ${totalWeekEntriesFixed} week entries fixed total.`);
    console.log("✅ Run these checks to confirm there are no remaining issues:");
    console.log("  db.students.countDocuments({ weeks: { $elemMatch: { $eq: null } } })");
    console.log("  db.students.countDocuments({ \"weeks\": { $elemMatch: { week: { $exists: false } } } })");

  } catch (err) {
    console.error("❌ Error fixing weeks:", err);
  } finally {
    if (client) await client.close();
  }
}

fixMissingWeeks();
