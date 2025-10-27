import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
// Removed weeks import - using lessons instead
import Title from "../../components/Title";
import GradeSelect from "../../components/CourseSelect";
import CenterSelect from "../../components/CenterSelect";
import CourseTypeSelect from "../../components/CourseTypeSelect";
import AttendanceWeekSelect from "../../components/AttendancelessonSelect";
import { Table, ScrollArea } from '@mantine/core';
import styles from '../../styles/TableScrollArea.module.css';
import { IconArrowRight, IconSearch } from '@tabler/icons-react';
import { ActionIcon, TextInput, useMantineTheme } from '@mantine/core';
import { useStudentsHistory } from '../../lib/api/students';
import LoadingSkeleton from '../../components/LoadingSkeleton';

export function InputWithButton(props) {
  const theme = useMantineTheme();
  return (
    <TextInput
      radius="xl"
      size="md"
      placeholder="Search by ID, Name, School, Student Phone or Parent Phone"
      rightSectionWidth={42}
      leftSection={<IconSearch size={18} stroke={1.5} />}
      rightSection={
        <ActionIcon size={32} radius="xl" color={theme.primaryColor} variant="filled" onClick={props.onButtonClick}>
          <IconArrowRight size={18} stroke={1.5} />
        </ActionIcon>
      }
      {...props}
    />
  );
}

// No client-side token handling; auth is enforced in _app.js

export default function History() {
  const router = useRouter();
  const containerRef = useRef(null);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedCenter, setSelectedCenter] = useState("");
  const [selectedCourseType, setSelectedCourseType] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null); // 'grade', 'center', 'courseType', 'week', or null
  const [searchTerm, setSearchTerm] = useState("");

  // Load remembered filter values from sessionStorage
  useEffect(() => {
    const rememberedGrade = sessionStorage.getItem('historySelectedGrade');
    const rememberedCenter = sessionStorage.getItem('historySelectedCenter');
    const rememberedCourseType = sessionStorage.getItem('historySelectedCourseType');
    const rememberedWeek = sessionStorage.getItem('historySelectedWeek');
    
    if (rememberedGrade) {
      setSelectedGrade(rememberedGrade);
    }
    if (rememberedCenter) {
      setSelectedCenter(rememberedCenter);
    }
    if (rememberedCourseType) {
      setSelectedCourseType(rememberedCourseType);
    }
    if (rememberedWeek) {
      setSelectedWeek(rememberedWeek);
    }
  }, []);

  // React Query hook with real-time updates - 5 second polling
  const { data: students = [], isLoading, error, refetch, isRefetching, dataUpdatedAt } = useStudentsHistory({
    // Aggressive real-time settings for immediate updates
    refetchInterval: 5 * 1000, // Refetch every 5 seconds for real-time updates
    refetchIntervalInBackground: true, // Continue when tab is not active
    refetchOnWindowFocus: true, // Immediate update when switching back to tab
    refetchOnReconnect: true, // Refetch when reconnecting to internet
    staleTime: 0, // Always consider data stale to force refetch
    gcTime: 1000, // Keep in cache for only 1 second
    refetchOnMount: true, // Always refetch when component mounts/page entered
  });

  // Debug: Log React Query status
  useEffect(() => {
    console.log('React Query Status:', {
      isLoading,
      isRefetching,
      dataUpdatedAt: new Date(dataUpdatedAt).toLocaleTimeString(),
      studentsCount: students.length,
      timestamp: new Date().toLocaleTimeString()
    });
  }, [isLoading, isRefetching, dataUpdatedAt, students.length]);

  useEffect(() => {
    // Authentication is now handled by _app.js with HTTP-only cookies
    // This component will only render if user is authenticated
  }, [router]);

  useEffect(() => {
    filterStudents();
  }, [students, selectedGrade, selectedCenter, selectedCourseType, selectedWeek, searchTerm]);

  // Debug: Log when data changes to confirm real-time updates
  useEffect(() => {
    if (students.length > 0) {
      console.log(`History data updated: ${students.length} records at ${new Date().toLocaleTimeString()}`);
    }
  }, [students]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);



  const filterStudents = () => {
    let filtered = students;

    // Pre-filter by searchTerm first to ensure ID/phone searches are not lost
    if (searchTerm.trim() !== "") {
      const term = searchTerm.trim();
      if (/^\d+$/.test(term)) {
        // Digits only: prioritize exact ID match, then phone matches
        filtered = filtered.filter(student => {
          // Convert both to strings for comparison to handle any type differences
          const studentId = String(student.id || '');
          const studentPhone = String(student.phone || '');
          const parentPhone = String(student.parentsPhone || '');
          
          // If search term starts with "01", treat it as phone number search
          if (term.startsWith('01')) {
            return studentId === term ||
                   studentPhone.includes(term) ||
                   parentPhone.includes(term);
          }
          
          // If search term is short (1-3 digits), prioritize exact ID match
          if (term.length <= 3) {
            return studentId === term;
          }
          
          // For longer numeric searches, search in ID and phone fields
          return studentId === term ||
                 studentPhone.includes(term) ||
                 parentPhone.includes(term);
        });
      } else {
        // Text: search in name, school, and phone fields (case-insensitive for text fields)
        filtered = filtered.filter(student =>
          (student.name && student.name.toLowerCase().includes(term.toLowerCase())) ||
          (student.school && student.school.toLowerCase().includes(term.toLowerCase())) ||
          (student.phone && student.phone.includes(term)) ||
          (student.parentsPhone && student.parentsPhone.includes(term))
        );
      }
    }

    // Show all students who have history records
    filtered = filtered.filter(student => 
      student.historyRecords && student.historyRecords.length > 0
    );

    // Create filtered records for each student
    filtered = filtered.map(student => {
      let filteredRecords = [...student.historyRecords];

      if (selectedGrade) {
        // Filter by current student grade, not the grade stored in history record
        // This ensures that when a student's grade is edited, filtering works with the updated grade
        if (student.grade.toLowerCase() === selectedGrade.toLowerCase()) {
          // Keep all records for this student since their current grade matches the filter
        } else {
          // Filter out all records for this student since their current grade doesn't match
          filteredRecords = [];
        }
      }

      if (selectedCenter) {
        filteredRecords = filteredRecords.filter(record => 
          record.center && record.center.toLowerCase() === selectedCenter.toLowerCase()
        );
      }

      if (selectedCourseType) {
        // Filter by current student course type, not the course type stored in history record
        // This ensures that when a student's course type is edited, filtering works with the updated course type
        if (student.courseType && student.courseType.toLowerCase() === selectedCourseType.toLowerCase()) {
          // Keep all records for this student since their current course type matches the filter
        } else {
          // Filter out all records for this student since their current course type doesn't match
          filteredRecords = [];
        }
      }

      if (selectedWeek && selectedWeek !== '') {
        filteredRecords = filteredRecords.filter(record => {
          const recordWeek = record.week || 'n/a';
          // Convert week string to number for comparison
          const weekMatch = selectedWeek.match(/lesson (\d+)/);
          const selectedWeekNumber = weekMatch ? parseInt(weekMatch[1]) : null;
          return selectedWeekNumber && recordWeek === selectedWeekNumber;
        });
      }

      return {
        ...student,
        historyRecords: filteredRecords
      };
    });

    // Only keep students who have matching records after filtering
    filtered = filtered.filter(student => student.historyRecords.length > 0);

    setFilteredStudents(filtered);
  };

  if (isLoading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        padding: "20px 5px 20px 5px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <div style={{ 
          width: "100%", 
          maxWidth: "800px", 
          margin: "0 auto",
          padding: "0 15px" 
        }}>
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: "100vh", 
      padding: "20px 5px 20px 5px" 
    }}>
      <div ref={containerRef} style={{ maxWidth: 800, margin: "40px auto", padding: "20px 15px 20px 15px" }}>
        <div style={{ marginBottom: 20 }}>
          <Title>History</Title>
        </div>
        
        {/* Search Bar */}
        <div style={{ marginBottom: 20 }}>
          <InputWithButton
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <style jsx>{`
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
          
          .filters-container {
            background: white;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            margin-bottom: 24px;
          }
          .filter-row {
            display: flex;
            gap: 12px;
            margin-bottom: 16px;
            flex-wrap: wrap;
          }
          .filter-group {
            flex: 1;
            min-width: 180px;
          }
          .filter-label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #495057;
            font-size: 0.95rem;
          }
          .filter-select {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e9ecef;
            border-radius: 10px;
            font-size: 1rem;
            transition: all 0.3s ease;
            background: #ffffff;
            color: #000000;
          }
          .filter-select:focus {
            outline: none;
            border-color: #87CEEB;
            box-shadow: 0 0 0 3px rgba(135, 206, 235, 0.1);
          }
          .history-container {
            background: white;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          }
          .history-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: #495057;
            margin-bottom: 20px;
            text-align: center;
          }
          .no-results {
            text-align: center;
            color: #6c757d;
            font-style: italic;
            padding: 40px 20px;
          }
        `}</style>

        <div className="filters-container">
          <div className="filter-row">
            <div className="filter-group">
              <label className="filter-label">Filter by Course</label>
              <GradeSelect
                selectedGrade={selectedGrade}
                onGradeChange={(grade) => {
                  setSelectedGrade(grade);
                  // Remember the selected grade
                  if (grade) {
                    sessionStorage.setItem('historySelectedGrade', grade);
                  } else {
                    sessionStorage.removeItem('historySelectedGrade');
                  }
                }}
                isOpen={openDropdown === 'grade'}
                onToggle={() => setOpenDropdown(openDropdown === 'grade' ? null : 'grade')}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
            <div className="filter-group">
              <label className="filter-label">Filter by Course Type</label>
              <CourseTypeSelect
                selectedCourseType={selectedCourseType}
                onCourseTypeChange={(courseType) => {
                  setSelectedCourseType(courseType);
                  // Remember the selected course type
                  if (courseType) {
                    sessionStorage.setItem('historySelectedCourseType', courseType);
                  } else {
                    sessionStorage.removeItem('historySelectedCourseType');
                  }
                }}
                isOpen={openDropdown === 'courseType'}
                onToggle={() => setOpenDropdown(openDropdown === 'courseType' ? null : 'courseType')}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
            <div className="filter-group">
              <label className="filter-label">Filter by Center</label>
              <CenterSelect
                selectedCenter={selectedCenter}
                onCenterChange={(center) => {
                  setSelectedCenter(center);
                  // Remember the selected center
                  if (center) {
                    sessionStorage.setItem('historySelectedCenter', center);
                  } else {
                    sessionStorage.removeItem('historySelectedCenter');
                  }
                }}
                isOpen={openDropdown === 'center'}
                onToggle={() => setOpenDropdown(openDropdown === 'center' ? null : 'center')}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
            <div className="filter-group">
              <label className="filter-label">Filter by Lesson</label>
              <AttendanceWeekSelect
                selectedWeek={selectedWeek}
                onWeekChange={(week) => {
                  setSelectedWeek(week);
                  // Remember the selected week
                  if (week) {
                    sessionStorage.setItem('historySelectedWeek', week);
                  } else {
                    sessionStorage.removeItem('historySelectedWeek');
                  }
                }}
                isOpen={openDropdown === 'week'}
                onToggle={() => setOpenDropdown(openDropdown === 'week' ? null : 'week')}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
          </div>
        </div>

        <div className="history-container">
          <div className="history-title">
            Attendance History ({filteredStudents.reduce((total, student) => total + student.historyRecords.length, 0)} records)
          </div>
          
          {error && (
            <div style={{
              background: 'linear-gradient(135deg, #dc3545 0%, #e74c3c 100%)',
              color: 'white',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
              textAlign: 'center',
              fontWeight: 600
            }}>
              {error?.message || error?.toString() || 'An error occurred'}
            </div>
          )}

          {filteredStudents.length === 0 ? (
            <div className="no-results">
              {selectedGrade || selectedCenter || selectedWeek 
                ? "No students found with the selected filters."
                : "No attendance records found."
              }
            </div>
          ) : (
            <ScrollArea h={400} type="hover" className={styles.scrolled}>
              <Table striped highlightOnHover withTableBorder withColumnBorders style={{ minWidth: '1500px' }}>
                <Table.Thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 10 }}>
                  <Table.Tr>
                    <Table.Th style={{ width: '60px', minWidth: '60px', textAlign: 'center' }}>ID</Table.Th>
                    <Table.Th style={{ width: '120px', minWidth: '120px', textAlign: 'center' }}>Name</Table.Th>
                    <Table.Th style={{ width: '100px', minWidth: '100px', textAlign: 'center' }}>Course</Table.Th>
                    <Table.Th style={{ width: '100px', minWidth: '100px', textAlign: 'center' }}>Course Type</Table.Th>
                    <Table.Th style={{ width: '180px', minWidth: '180px', textAlign: 'center' }}>School</Table.Th>
                    <Table.Th style={{ width: '120px', minWidth: '120px', textAlign: 'center' }}>Phone No.</Table.Th>
                    <Table.Th style={{ width: '130px', minWidth: '130px', textAlign: 'center' }}>Parent No. 1</Table.Th>
                    <Table.Th style={{ width: '100px', minWidth: '100px', textAlign: 'center' }}>Lesson</Table.Th>
                    <Table.Th style={{ width: '120px', minWidth: '120px', textAlign: 'center' }}>Main Center</Table.Th>
                    <Table.Th style={{ width: '140px', minWidth: '140px', textAlign: 'center' }}>Attendance Info</Table.Th>
                    <Table.Th style={{ width: '100px', minWidth: '100px', textAlign: 'center' }}>HW Status</Table.Th>
                    <Table.Th style={{ width: '100px', minWidth: '100px', textAlign: 'center' }}>Quiz Degree</Table.Th>
                    <Table.Th style={{ width: '160px', minWidth: '160px', textAlign: 'center' }}>Main Comment</Table.Th>
                    <Table.Th style={{ width: '160px', minWidth: '160px', textAlign: 'center' }}>Lesson Comment</Table.Th>
                    <Table.Th style={{ width: '140px', minWidth: '140px', textAlign: 'center' }}>Student Message State</Table.Th>
                    <Table.Th style={{ width: '140px', minWidth: '140px', textAlign: 'center' }}>Parent Message State</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredStudents.map(student => 
                    student.historyRecords.map((record, index) => (
                      <Table.Tr key={`${student.id}-${index}`}>
                        <Table.Td style={{ fontWeight: 'bold', color: '#1FA8DC', width: '60px', minWidth: '60px', textAlign: 'center' }}>{student.id}</Table.Td>
                        <Table.Td style={{ width: '120px', minWidth: '120px', textAlign: 'center' }}>{student.name}</Table.Td>
                        <Table.Td style={{ width: '100px', minWidth: '100px', textAlign: 'center' }}>{student.grade || 'N/A'}</Table.Td>
                        <Table.Td style={{ width: '100px', minWidth: '100px', textAlign: 'center' }}>{student.courseType || 'N/A'}</Table.Td>
                        <Table.Td style={{ width: '180px', minWidth: '180px', wordWrap: 'break-word', textAlign: 'center' }}>{student.school || 'N/A'}</Table.Td>
                        <Table.Td style={{ width: '120px', minWidth: '120px', textAlign: 'center' }}>{student.phone || 'N/A'}</Table.Td>
                    <Table.Td style={{ width: '130px', minWidth: '130px', textAlign: 'center' }}>{
                      (() => {
                        // Prefer student-level fields, then record-level fallbacks
                        const fromStudent = (student.parents_phone || student.parentsPhone1 || student.parentsPhone || student.parents_phone1);
                        const fromRecord = (record.parents_phone || record.parentsPhone || record.parent_phone || record.parentPhone);
                        return fromStudent || fromRecord || 'N/A';
                      })()
                    }</Table.Td>
                        <Table.Td style={{ width: '100px', minWidth: '100px', textAlign: 'center' }}>
                          {(() => {
                            // Handle both lesson names and week numbers for backward compatibility
                            if (record.lesson && typeof record.lesson === 'string') {
                              return record.lesson; // Already a lesson name
                            } else {
                              // Convert week number to lesson name
                              const week = record.week || 1;
                              const lessonNames = ['If Conditions', 'Transition Words', 'Parallel Structure', 'Subject-Verb Agreement', 'Pronoun Usage', 'Modifier Placement', 'Verb Tenses', 'Punctuation Rules', 'Redundancy and Wordiness', 'Tone and Style'];
                              return lessonNames[week - 1] || `Lesson ${week}`;
                            }
                          })()}
                        </Table.Td>
                        <Table.Td style={{ width: '120px', minWidth: '120px', textAlign: 'center' }}>{record.main_center || 'N/A'}</Table.Td>
                        <Table.Td style={{ width: '140px', minWidth: '140px', textAlign: 'center' }}>{record.attendanceDate || 'N/A'}</Table.Td>
                        <Table.Td style={{ width: '100px', minWidth: '100px', textAlign: 'center' }}>
                          {(() => {
                            if (record.hwDone === "No Homework") {
                              return <span style={{ 
                                color: '#dc3545',
                                fontWeight: 'bold'
                              }}>🚫 No Homework</span>;
                            } else if (record.hwDone === "Not Completed") {
                              return <span style={{ 
                                color: '#856404',
                                fontWeight: 'bold'
                              }}>⚠️ Not Completed</span>;
                            } else if (record.hwDone === true) {
                              // Show Done with degree if available
                              let degree = '';
                              try {
                                // Prefer degree from the history record if present
                                degree = (record.homework_degree ?? record.hwDegree ?? '').toString().trim();
                                if (!degree) {
                                  // Fallback: derive from student's lessons by lesson name or week index
                                  if (record.lesson && typeof record.lesson === 'string') {
                                    if (student.lessons && typeof student.lessons === 'object' && !Array.isArray(student.lessons)) {
                                      degree = (student.lessons[record.lesson]?.homework_degree ?? '').toString().trim();
                                    } else if (Array.isArray(student.lessons)) {
                                      const lessonData = student.lessons.find(l => l && l.lesson === record.lesson);
                                      degree = (lessonData?.homework_degree ?? '').toString().trim();
                                    }
                                  } else {
                                    const weekIdx = ((record?.week ?? 0) - 1);
                                    if (Array.isArray(student.lessons) && weekIdx >= 0) {
                                      degree = (student.lessons[weekIdx]?.homework_degree ?? '').toString().trim();
                                    } else if (Array.isArray(student.weeks) && weekIdx >= 0) {
                                      degree = (student.weeks[weekIdx]?.homework_degree ?? '').toString().trim();
                                    }
                                  }
                                }
                              } catch {}
                              const hasDegree = degree && degree !== '';
                              return (
                                <span style={{ color: '#28a745', fontWeight: 'bold' }}>
                                  {hasDegree ? `✅ Done (${degree})` : '✅ Done'}
                                </span>
                              );
                            } else {
                              return <span style={{ 
                                color: '#dc3545',
                                fontWeight: 'bold'
                              }}>❌ Not Done</span>;
                            }
                          })()}
                        </Table.Td>
                        
                        <Table.Td style={{ width: '100px', minWidth: '100px', textAlign: 'center' }}>
                          {(() => {
                            const value = (record.quizDegree !== undefined && record.quizDegree !== null && record.quizDegree !== '') ? record.quizDegree : '0/0';
                            if (value === "Didn't Attend The Quiz") {
                              return <span style={{ color: '#dc3545', fontWeight: 'bold' }}>✗ Didn't Attend The Quiz</span>;
                            } else if (value === "No Quiz") {
                              return <span style={{ color: '#dc3545', fontWeight: 'bold' }}>🚫 No Quiz</span>;
                            }
                            return value;
                          })()}
                        </Table.Td>
                        <Table.Td style={{ width: '160px', minWidth: '160px', textAlign: 'center' }}>
                          {(() => {
                            try {
                              const mainComment = (student.main_comment ?? '').toString();
                              return mainComment.trim() !== '' ? mainComment : 'No Comment';
                            } catch {
                              return 'No Comment';
                            }
                          })()}
                        </Table.Td>
                        <Table.Td style={{ width: '160px', minWidth: '160px', textAlign: 'center' }}>
                          {(() => {
                            try {
                              let lessonComment = '';
                              
                              // Handle new lesson name format
                              if (record.lesson && typeof record.lesson === 'string') {
                                if (student.lessons && typeof student.lessons === 'object' && !Array.isArray(student.lessons)) {
                                  lessonComment = (student.lessons[record.lesson]?.comment ?? '').toString();
                                } else if (student.lessons && Array.isArray(student.lessons)) {
                                  const lessonData = student.lessons.find(l => l && l.lesson === record.lesson);
                                  lessonComment = (lessonData?.comment ?? '').toString();
                                }
                              } else {
                                // Handle old week number format
                                const weekIndex = ((record?.week ?? 0) - 1);
                                if (student.weeks && Array.isArray(student.weeks) && weekIndex >= 0) {
                                  lessonComment = (student.weeks[weekIndex]?.comment ?? '').toString();
                                } else if (student.lessons && Array.isArray(student.lessons) && weekIndex >= 0) {
                                  lessonComment = (student.lessons[weekIndex]?.comment ?? '').toString();
                                }
                              }
                              
                              return lessonComment.trim() !== '' ? lessonComment : 'No Comment';
                            } catch {
                              return 'No Comment';
                            }
                          })()}
                        </Table.Td>
                        <Table.Td style={{ width: '140px', minWidth: '140px', textAlign: 'center' }}>
                          {(() => {
                            // Prefer explicit flags from the history record if present
                            let sms;
                            if (record.student_message_state === true || record.student_message_state === false) {
                              sms = !!record.student_message_state;
                            } else {
                              try {
                                if (record.lesson && typeof record.lesson === 'string') {
                                  sms = !!(student.lessons && typeof student.lessons === 'object' && !Array.isArray(student.lessons) && student.lessons[record.lesson]?.student_message_state);
                                } else {
                                  const weekIdx = ((record?.week ?? 0) - 1);
                                  if (Array.isArray(student.lessons) && weekIdx >= 0) {
                                    sms = !!student.lessons[weekIdx]?.student_message_state;
                                  }
                                }
                              } catch {}
                            }
                            return (
                              <span style={{ color: sms ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                                {sms ? '✓ Sent' : '✗ Not Sent'}
                              </span>
                            );
                          })()}
                        </Table.Td>
                        <Table.Td style={{ width: '140px', minWidth: '140px', textAlign: 'center' }}>
                          {(() => {
                            // Prefer explicit flags from the history record if present
                            let pms;
                            if (record.parent_message_state === true || record.parent_message_state === false) {
                              pms = !!record.parent_message_state;
                            } else {
                              try {
                                if (record.lesson && typeof record.lesson === 'string') {
                                  pms = !!(student.lessons && typeof student.lessons === 'object' && !Array.isArray(student.lessons) && student.lessons[record.lesson]?.parent_message_state);
                                } else {
                                  const weekIdx = ((record?.week ?? 0) - 1);
                                  if (Array.isArray(student.lessons) && weekIdx >= 0) {
                                    pms = !!student.lessons[weekIdx]?.parent_message_state;
                                  }
                                }
                              } catch {}
                            }
                            return (
                              <span style={{ color: pms ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                                {pms ? '✓ Sent' : '✗ Not Sent'}
                              </span>
                            );
                          })()}
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
} 