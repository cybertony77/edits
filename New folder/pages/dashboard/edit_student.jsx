import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import CenterSelect from "../../components/CenterSelect";
import BackToDashboard from "../../components/BackToDashboard";
import GradeSelect from '../../components/CourseSelect';
import AccountStateSelect from '../../components/AccountStateSelect';
import Title from '../../components/Title';
import { useStudents, useStudent, useUpdateStudent } from '../../lib/api/students';

// Helper to normalize course values to match select options
function normalizeGrade(grade) {
  if (!grade) return "";
  const g = String(grade).toUpperCase().trim();
  if (["EST", "SAT", "ACT"].includes(g)) return g;
  return "";
}

export default function EditStudent() {
  const containerRef = useRef(null);
  const [studentId, setStudentId] = useState("");
  const [searchId, setSearchId] = useState(""); // Separate state for search
  const [formData, setFormData] = useState({}); // Local form state for editing
  const [originalStudent, setOriginalStudent] = useState(null); // Store original data for comparison
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null); // 'grade', 'center', or null
  const [searchResults, setSearchResults] = useState([]); // Store multiple search results
  const [showSearchResults, setShowSearchResults] = useState(false); // Show/hide search results

  // React Query hooks
  const { data: allStudents } = useStudents();
  const { data: student, isLoading: studentLoading, error: studentError } = useStudent(searchId, { enabled: !!searchId });
  const updateStudentMutation = useUpdateStudent();
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Handle student errors from React Query
  useEffect(() => {
    if (studentError) {
      setError("Student not found or unauthorized.");
    }
  }, [studentError]);

  // Set original student and form data when student data loads
  useEffect(() => {
    if (student && !originalStudent) {
      console.log('🔍 Student data received from API:', student);
      const studentData = {
        name: student.name,
        grade: normalizeGrade(student.grade),
        phone: student.phone,
        parents_phone: (student.parentsPhone1 || student.parents_phone || ''), // Support both old and new
        parents_phone2: (student.parentsPhone2 || student.parents_phone2 || ''),
        address: (student.address || ''),
        main_center: student.main_center,
        school: student.school || "",
        homeschooling: (student.school === "Homeschooling"),
        comment: student.main_comment || student.comment || "",
        account_state: student.account_state || "Activated"
      };
      console.log('📝 Form data being set:', studentData);
      setOriginalStudent({ ...studentData });
      setFormData({ ...studentData }); // Also set the form data
    }
  }, [student, originalStudent]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpenDropdown(null);
        // Also blur any focused input to close browser autocomplete
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
          document.activeElement.blur();
        }
      }
    };

    // Also handle when a dropdown opens to close others
    const handleDropdownOpen = () => {
      // Close any open dropdowns when a new one opens
      if (openDropdown) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('focusin', handleDropdownOpen);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('focusin', handleDropdownOpen);
    };
  }, [openDropdown]);
  const router = useRouter();

  const [center, setCenter] = useState("");
  const [hwDone, setHwDone] = useState(false);

  const handleIdSubmit = async (e) => {
    e.preventDefault();
    if (!studentId.trim()) return;
    
    setError("");
    setSuccess(false);
    setOriginalStudent(null);
    setSearchResults([]);
    setShowSearchResults(false);
    
    const searchTerm = studentId.trim();
    const isAllDigits = /^\d+$/.test(searchTerm);
    const isFullPhone = /^\d{11}$/.test(searchTerm);
    if (isFullPhone) { 
      if (allStudents) {
        const matchingStudents = allStudents.filter(s =>
          s.phone === searchTerm || s.parentsPhone1 === searchTerm || s.parentsPhone === searchTerm
        );
        if (matchingStudents.length === 1) {
          setSearchId(matchingStudents[0].id.toString());
          setStudentId(matchingStudents[0].id.toString()); // Auto-replace with ID
        } else {
          setSearchId(searchTerm);
        }
      } else {
        setSearchId(searchTerm);
      }
      return; 
    }
    if (isAllDigits) {
      if (allStudents) {
        const byId = allStudents.find(s => String(s.id) === searchTerm);
        if (byId) { setSearchId(String(byId.id)); setStudentId(String(byId.id)); return; }
        const matches = allStudents.filter(s => {
          const sp = String(s.phone||'').replace(/[^0-9]/g,'');
          const pp = String(s.parents_phone||s.parentsPhone||'').replace(/[^0-9]/g,'');
          return sp.startsWith(searchTerm) || pp.startsWith(searchTerm);
        });
        if (matches.length === 1) { const f = matches[0]; setSearchId(String(f.id)); setStudentId(String(f.id)); return; }
        if (matches.length > 1) { setSearchResults(matches); setShowSearchResults(true); setError(`Found ${matches.length} students. Please select one.`); return; }
      }
      setSearchId(searchTerm); return;
    }
    if (allStudents) {
      const matchingStudents = allStudents.filter(student => 
        student.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (matchingStudents.length === 1) {
        const foundStudent = matchingStudents[0];
        setSearchId(foundStudent.id.toString());
        setStudentId(foundStudent.id.toString());
      } else if (matchingStudents.length > 1) {
        setSearchResults(matchingStudents);
        setShowSearchResults(true);
        setError(`Found ${matchingStudents.length} students. Please select one.`);
      } else {
        setError(`No student found matching "${searchTerm}"`);
        setSearchId("");
      }
    } else {
      setError("Student data not loaded. Please try again.");
    }
  };

  // Clear student data when ID input is emptied
  const handleIdChange = (e) => {
    const value = e.target.value;
    setStudentId(value);
    setSearchId(""); // Clear search ID to prevent auto-fetch
    if (!value.trim()) {
      setFormData({});
      setOriginalStudent(null);
      setError("");
      setSuccess(false);
      setSearchResults([]);
      setShowSearchResults(false);
    }
  };

  // Handle student selection from search results
  const handleStudentSelect = (selectedStudent) => {
    setSearchId(selectedStudent.id.toString());
    setStudentId(selectedStudent.id.toString());
    setSearchResults([]);
    setShowSearchResults(false);
    setError("");
  };

  // After successful fetch, replace search input with numeric ID
  useEffect(() => {
    if (student && student.id != null) {
      const fetchedId = String(student.id);
      if (studentId !== fetchedId) {
        setStudentId(fetchedId);
      }
    }
  }, [student]);

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  // Helper function to get only changed fields
  const getChangedFields = () => {
    if (!formData || !originalStudent) return {};
    
    const changes = {};
    Object.keys(formData).forEach(key => {
      // Special handling: allow clearing comment (empty string) -> send as null
      if (key === 'comment') {
        if (formData[key] !== originalStudent[key]) {
          changes[key] = formData[key];
        }
        return;
      }
      // Only include fields that have actually changed and are not undefined/null/empty
      if (formData[key] !== originalStudent[key] &&
          formData[key] !== undefined &&
          formData[key] !== null &&
          formData[key] !== '') {
        changes[key] = formData[key];
      }
    });
    return changes;
  };

  // Helper function to check if any fields have changed
  const hasChanges = () => {
    if (!formData || !originalStudent) return false;
    
    return Object.keys(formData).some(key => formData[key] !== originalStudent[key]);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    
    // Check if there are any changes
    if (!hasChanges()) {
      setError("No changes detected. Please modify at least one field before saving.");
      return;
    }
    
    const changedFields = getChangedFields();
    
    // Validate phone numbers if they were changed
    if (changedFields.phone) {
      const studentPhone = changedFields.phone.toString();
      if (studentPhone.length !== 11) {
        setError("Student phone number must be exactly 11 digits");
        return;
      }
      changedFields.phone = studentPhone; // Keep as string to preserve leading zeros exactly
    }
    
    if (changedFields.parents_phone) {
      const parentPhone = changedFields.parents_phone.toString();
      if (parentPhone.length !== 11) {
        setError("Parent's phone number must be exactly 11 digits");
        return;
      }
      changedFields.parents_phone = parentPhone; // Keep as string to preserve leading zeros exactly
    }
    
    if (changedFields.parents_phone2) {
      const parentPhone2 = changedFields.parents_phone2.toString();
      if (parentPhone2.length !== 11) {
        setError("Parent's phone 2 number must be exactly 11 digits");
        return;
      }
      changedFields.parents_phone2 = parentPhone2; // Keep as string to preserve leading zeros exactly
    }
    
    // Check if student phone number is the same as parent phone numbers
    const currentStudentPhone = changedFields.phone || originalStudent.phone;
    const currentParentPhone = changedFields.parents_phone || originalStudent.parents_phone;
    const currentParentPhone2 = changedFields.parents_phone2 || originalStudent.parents_phone2;
    
    // Check if student phone number is the same as parent phone number 1
    if (currentStudentPhone === currentParentPhone) {
      setError("Student phone number cannot be the same as parent phone number 1");
      return;
    }
    
    // Check if student phone number is the same as parent phone number 2
    if (currentStudentPhone === currentParentPhone2) {
      setError("Student phone number cannot be the same as parent phone number 2");
      return;
    }
    
    // Check if parent phone numbers are the same
    if (currentParentPhone === currentParentPhone2) {
      setError("Parent's phone numbers cannot be the same");
      return;
    }
    
    // Debug logging
    console.log('🔍 Original student data:', originalStudent);
    console.log('✏️ Current form data:', formData);
    console.log('📤 Fields to be sent:', changedFields);
    
    // Only send changed fields
    const updatedStudent = { ...changedFields };
    
    // Handle special field transformations
    if (changedFields.grade) {
      updatedStudent.grade = changedFields.grade.toLowerCase().replace(/\./g, '');
    }
    // Normalize comment: empty string -> null, trim non-empty
    if (Object.prototype.hasOwnProperty.call(changedFields, 'comment')) {
      const c = changedFields.comment;
      updatedStudent.main_comment = (typeof c === 'string' && c.trim() === '') ? null : (typeof c === 'string' ? c.trim() : c);
      delete updatedStudent.comment;
    }
    
    // Handle school field based on homeschooling checkbox
    if (Object.prototype.hasOwnProperty.call(changedFields, 'homeschooling')) {
      if (changedFields.homeschooling) {
        updatedStudent.school = "Homeschooling";
      }
      // Remove homeschooling field from payload since we don't store it in DB
      delete updatedStudent.homeschooling;
    }
    
    console.log('🚀 Final payload being sent:', updatedStudent);
    
    updateStudentMutation.mutate(
      { id: searchId, updateData: updatedStudent },
      {
        onSuccess: () => {
          setSuccess(true);
          // Update original data to reflect the new state
          setOriginalStudent({ ...formData });
        },
        onError: (err) => {
          setError("Failed to edit student.");
        }
      }
    );
  };

  const goBack = () => {
    router.push("/dashboard");
  };

  return (
    <div style={{ 
      minHeight: "100vh",
      padding: "20px 5px 20px 5px"
    }}>
      <div ref={containerRef} style={{ maxWidth: 600, margin: "40px auto", padding: 24 }}>
      <style jsx>{`
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }
        .title {
          font-size: 2rem;
          font-weight: 700;
          color: #ffffff;
        }
        .back-btn {
          background: linear-gradient(90deg, #6c757d 0%, #495057 100%);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .back-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .fetch-form {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 24px;
        }
        .fetch-input {
          flex: 1;
          padding: 14px 16px;
          border: 2px solid #e9ecef;
          border-radius: 10px;
          font-size: 1rem;
          transition: all 0.3s ease;
          background: #ffffff;
          color: #000000;
        }
        .fetch-input:focus {
          outline: none;
          border-color: #667eea;
          background: white;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        .fetch-btn {
          background: linear-gradient(135deg, #1FA8DC 0%, #87CEEB 100%);
          color: white;
          border: none;
          border-radius: 12px;
          padding: 16px 28px;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 16px rgba(31, 168, 220, 0.3);
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 140px;
          justify-content: center;
        }
        .fetch-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 25px rgba(31, 168, 220, 0.4);
          background: linear-gradient(135deg, #0d8bc7 0%, #5bb8e6 100%);
        }
        .fetch-btn:active {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(31, 168, 220, 0.3);
        }
        .success-message {
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          border-radius: 10px;
          padding: 16px;
          margin-top: 16px;
          text-align: center;
          font-weight: 600;
          box-shadow: 0 4px 16px rgba(40, 167, 69, 0.3);
        }
        .error-message {
          background: linear-gradient(135deg, #dc3545 0%, #e74c3c 100%);
          color: white;
          border-radius: 10px;
          padding: 16px;
          margin-top: 16px;
          text-align: center;
          font-weight: 600;
          box-shadow: 0 4px 16px rgba(220, 53, 69, 0.3);
        }
        .form-container {
          background: white;
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          border: 1px solid rgba(255,255,255,0.2);
        }
        .form-group {
          margin-bottom: 24px;
        }
        .form-group label {
          display: block;
          margin-bottom: 10px;
          font-weight: 600;
          color: #495057;
          font-size: 0.95rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .form-input {
          width: 100%;
          padding: 16px 18px;
          border: 2px solid #e9ecef;
          border-radius: 12px;
          font-size: 1rem;
          transition: all 0.3s ease;
          box-sizing: border-box;
          background: #ffffff;
          color: #000000;
        }
        .form-input:focus {
          outline: none;
          border-color: #1FA8DC;
          background: white;
          box-shadow: 0 0 0 3px rgba(31, 168, 220, 0.1);
        }
        .form-input::placeholder {
          color: #adb5bd;
        }
        .submit-btn {
          width: 100%;
          padding: 18px;
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1.1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 16px rgba(40, 167, 69, 0.3);
          margin-top: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .submit-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 25px rgba(40, 167, 69, 0.4);
          background: linear-gradient(135deg, #1e7e34 0%, #17a2b8 100%);
        }
        .submit-btn:active {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(40, 167, 69, 0.3);
        }
        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: 0 2px 8px rgba(40, 167, 69, 0.2);
        }
        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }
        .select-styled {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e9ecef;
          border-radius: 10px;
          font-size: 1rem;
          background: #fff;
          color: #222;
          transition: border-color 0.2s, box-shadow 0.2s;
          margin-top: 4px;
          box-sizing: border-box;
        }
        .select-styled:focus {
          outline: none;
          border-color: #87CEEB;
          box-shadow: 0 0 0 3px rgba(135, 206, 235, 0.1);
        }
        .changes-indicator {
          background: linear-gradient(135deg, #17a2b8 0%, #20c997 100%);
          color: white;
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 16px;
          text-align: center;
          font-weight: 600;
          box-shadow: 0 4px 16px rgba(23, 162, 184, 0.3);
        }
        .no-changes {
          background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
          color: white;
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 16px;
          text-align: center;
          font-weight: 600;
          box-shadow: 0 4px 16px rgba(108, 117, 125, 0.3);
        }
        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .fetch-form {
            flex-direction: column;
            gap: 12px;
          }
          .fetch-btn {
            width: 100%;
            padding: 14px 20px;
            font-size: 0.95rem;
          }
          .fetch-input {
            width: 100%;
          }
          .form-container {
            padding: 24px;
          }
          .form-group {
            margin-bottom: 20px;
          }
          .form-input, .fetch-input {
            padding: 14px 16px;
          }
        }
        @media (max-width: 480px) {
          .form-container {
            padding: 20px;
          }
          .form-group label {
            font-size: 0.9rem;
          }
          .form-input, .fetch-input {
            padding: 12px 14px;
            font-size: 0.95rem;
          }
          .submit-btn {
            padding: 16px;
            font-size: 1rem;
          }
        }
      `}</style>

      <Title>Edit Student</Title>

      <div className="form-container">
        
        <form onSubmit={handleIdSubmit} className="fetch-form">
          <input
            className="fetch-input"
            type="text"
            placeholder="Enter Student ID, Name, Phone Number"
            value={studentId}
            onChange={handleIdChange}
          />
          <button type="submit" className="fetch-btn" disabled={studentLoading}>
            {studentLoading ? "Loading..." : "🔍 Search"}
          </button>
        </form>
        
        {/* Show search results if multiple matches found */}
        {showSearchResults && searchResults.length > 0 && (
          <div style={{ 
            marginTop: "16px", 
            padding: "16px", 
            background: "#f8f9fa", 
            borderRadius: "8px", 
            border: "1px solid #dee2e6" 
          }}>
            <div style={{ 
              marginBottom: "12px", 
              fontWeight: "600", 
              color: "#495057" 
            }}>
              Select a student:
            </div>
            {searchResults.map((student) => (
              <button
                key={student.id}
                onClick={() => handleStudentSelect(student)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "12px 16px",
                  margin: "8px 0",
                  background: "white",
                  border: "1px solid #dee2e6",
                  borderRadius: "6px",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "#e9ecef";
                  e.target.style.borderColor = "#1FA8DC";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "white";
                  e.target.style.borderColor = "#dee2e6";
                }}
              >
                <div style={{ fontWeight: "600", color: "#1FA8DC" }}>
                  {student.name} (ID: {student.id})
                </div>
                <div style={{ fontSize: "0.9rem", color: "#6c757d" }}>
                  {student.grade} • {student.main_center}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {student && (
        <div className="form-container" style={{ marginTop: "20px" }}>
          {/* Show changes indicator */}
          {hasChanges() ? (
            <div className="changes-indicator">
              ✏️ Changes detected - Only modified fields will be sent to server
            </div>
          ) : (
            <div className="no-changes">
              ℹ️ No changes detected - Modify at least one field to enable save
            </div>
          )}
          
          <form onSubmit={handleEdit}>
            <div className="form-group">
              <label>Full Name</label>
              <input
                className="form-input"
                name="name"
                placeholder="Enter student's full name"
                value={formData.name || ''}
                onChange={handleChange}
                autocomplete="off"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
              <label>Course</label>
                <GradeSelect 
                  selectedGrade={formData.grade || ''} 
                  onGradeChange={(grade) => handleChange({ target: { name: 'grade', value: grade } })} 
                  isOpen={openDropdown === 'grade'}
                  onToggle={() => setOpenDropdown(openDropdown === 'grade' ? null : 'grade')}
                  onClose={() => setOpenDropdown(null)}
                />
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <label>School</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', fontWeight: 'normal', color: '#666' }}>
                    <input
                      type="checkbox"
                      name="homeschooling"
                      checked={formData.homeschooling || false}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        console.log('🏠 Homeschooling checkbox clicked:', isChecked);
                        // Update both homeschooling and school fields in one state update
                        setFormData(prev => {
                          const newData = {
                            ...prev,
                            homeschooling: isChecked,
                            school: isChecked ? prev.school : '' // Clear school when unchecking
                          };
                          console.log('📝 New form data:', newData);
                          return newData;
                        });
                      }}
                      style={{ margin: 0 }}
                    />
                    Homeschooling
                  </label>
                </div>
                {!formData.homeschooling && (
                  <input
                    className="form-input"
                    name="school"
                    placeholder="Enter student's school"
                    value={formData.school || ''}
                    onChange={handleChange}
                    autocomplete="off"
                  />
                )}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Student Phone</label>
                <input
                  className="form-input"
                  name="phone"
                  type="tel"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="Enter student's phone number (11 digits)"
                  value={formData.phone || ''}
                  maxLength={11}
                  onChange={(e) => {
                    // Only allow numbers and limit to 11 digits
                    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
                    handleChange({ target: { name: 'phone', value } });
                  }}
                  autocomplete="off"
                />
                <small style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: '4px', display: 'block' }}>
                  Must be exactly 11 digits (e.g., 12345678901)
                </small>
              </div>
              <div className="form-group">
                <label>Parent's Phone 1 (Whatsapp)</label>
                <input
                  className="form-input"
                  name="parents_phone"
                  type="tel"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="Enter parent's phone number (11 digits)"
                  value={formData.parents_phone || ''}
                  maxLength={11}
                  onChange={(e) => {
                    // Only allow numbers and limit to 11 digits
                    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
                    handleChange({ target: { name: 'parents_phone', value } });
                  }}

                  autocomplete="off"
                />
                <small style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: '4px', display: 'block' }}>
                  Must be exactly 11 digits (e.g., 12345678901)
                </small>
              </div>
            </div>
            <div className="form-group">
              <label>Parent's Phone 2 <span style={{color: 'red'}}>*</span></label>
              <input
                className="form-input"
                name="parents_phone2"
                type="tel"
                pattern="[0-9]*"
                inputMode="numeric"
                placeholder="Enter second parent's phone number (11 digits)"
                value={formData.parents_phone2 || ''}
                maxLength={11}
                onChange={(e) => {
                  // Only allow numbers and limit to 11 digits
                  const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
                  handleChange({ target: { name: 'parents_phone2', value } });
                }}
                required
                autocomplete="off"
              />
              <small style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: '4px', display: 'block' }}>
                Must be exactly 11 digits (e.g., 12345678901)
              </small>
            </div>
            <div className="form-group">
              <label>Address <span style={{color: 'red'}}>*</span></label>
              <input
                className="form-input"
                name="address"
                placeholder="Enter student's address"
                value={formData.address || ''}
                onChange={handleChange}
                required
                autocomplete="off"
              />
            </div>
            <div className="form-group" style={{ width: '100%' }}>
              <label>Main Center</label>
              <CenterSelect 
                selectedCenter={formData.main_center || ''} 
                onCenterChange={(center) => handleChange({ target: { name: 'main_center', value: center } })} 
                style={{ width: '100%' }}
                isOpen={openDropdown === 'center'}
                onToggle={() => setOpenDropdown(openDropdown === 'center' ? null : 'center')}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
            <AccountStateSelect
              value={formData.account_state || 'Activated'}
              onChange={(value) => handleChange({ target: { name: 'account_state', value } })}
              required={false}
            />
            <div className="form-group">
              <label>Hidden Comment</label>
              <textarea
                className="form-input"
                name="comment"
                placeholder="Enter any notes about this student"
                value={formData.comment || ''}
                onChange={handleChange}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
            <button type="submit" className="submit-btn" disabled={!hasChanges() || updateStudentMutation.isPending}>
              {updateStudentMutation.isPending ? "Saving..." : "✏️ Update Student"}
            </button>
          </form>
        </div>
      )}
      
      {success && (
        <div className="success-message">
          ✅ Student updated successfully!
        </div>
      )}
      
      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}
      </div>
    </div>
  );
}
