import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { AVAILABLE_CENTERS } from "../../constants/centers";
import Title from "../../components/Title";
import GradeSelect from "../../components/GradeSelect";
import CenterSelect from "../../components/CenterSelect";
import { SessionTable } from "../../components/SessionTable.jsx";
import { IconArrowRight, IconSearch } from '@tabler/icons-react';
import { ActionIcon, TextInput, useMantineTheme } from '@mantine/core';
import { useStudents } from '../../lib/api/students';
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
        <ActionIcon size={32} radius="xl" color={theme.primaryColor} variant="filled">
          <IconArrowRight size={18} stroke={1.5} />
        </ActionIcon>
      }
      {...props}
    />
  );
}

export default function AllStudents() {
  const router = useRouter();
  const containerRef = useRef(null);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedCenter, setSelectedCenter] = useState("");
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null); // 'grade', 'center', or null
  const [searchTerm, setSearchTerm] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  // React Query hook for fetching students with optimized settings for large datasets
  const { data: students = [], isLoading, error, refetch } = useStudents({
    // Optimized settings for large datasets
    refetchInterval: 60 * 1000, // Refetch every 60 seconds
    refetchIntervalInBackground: false, // Don't refetch when tab is not active
    refetchOnWindowFocus: true, // Immediate update when switching back to tab
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });

  // Load remembered filter values from sessionStorage
  useEffect(() => {
    const rememberedGrade = sessionStorage.getItem('allStudentsSelectedGrade');
    const rememberedCenter = sessionStorage.getItem('allStudentsSelectedCenter');
    
    if (rememberedGrade) {
      setSelectedGrade(rememberedGrade);
    }
    if (rememberedCenter) {
      setSelectedCenter(rememberedCenter);
    }
  }, []);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    // Authentication is now handled by _app.js with HTTP-only cookies
    // This component will only render if user is authenticated
    
    // Check if mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, [router]);

  // Filter students whenever dependencies change
  useEffect(() => {
    // Ensure students is always an array
    if (!Array.isArray(students)) {
      setFilteredStudents([]);
      return;
    }
    
    let filtered = students;
    if (selectedGrade) filtered = filtered.filter(student => 
      student.grade && student.grade.toLowerCase() === selectedGrade.toLowerCase()
    );
    if (selectedCenter) filtered = filtered.filter(student => 
      student.main_center && student.main_center.toLowerCase() === selectedCenter.toLowerCase()
    );
    if (searchTerm.trim() !== "") {
      const term = searchTerm.trim();
      if (/^\d+$/.test(term)) {
        // Digits only: prioritize exact ID match, then phone matches
        filtered = filtered.filter(student => {
          // Convert both to strings for comparison to handle any type differences
          const studentId = String(student.id || '');
          const studentPhone = String(student.phone || '');
          const parentPhone = String(student.parents_phone || '');
          
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
          (student.parents_phone && student.parents_phone.includes(term))
        );
      }
    }
    setFilteredStudents(filtered);
  }, [students, selectedGrade, selectedCenter, searchTerm]);

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

  // Auto-refresh students data every 60 seconds (reduced frequency for large datasets)
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 60000); // 60 seconds
    
    return () => clearInterval(interval);
  }, [refetch]);






  if (isLoading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        padding: "20px 5px 20px 5px"
      }}>
        <div style={{ maxWidth: 800, margin: "40px auto", padding: "12px" }}>
          <Title>All Students</Title>
          <LoadingSkeleton type="table" rows={8} columns={4} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: "100vh", 
      padding: "20px 5px 20px 5px" 
    }}>
      <div ref={containerRef} style={{ maxWidth: 800, margin: "40px auto", padding: "12px" }}>
        <Title>All Students</Title>
        {/* Search Bar */}
        <div style={{ marginBottom: 20 }}>
          <InputWithButton
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filters-container">
          <div className="filter-row">
            <div className="filter-group">
              <label className="filter-label">Filter by Grade</label>
              <GradeSelect
                selectedGrade={selectedGrade}
                onGradeChange={(grade) => {
                  setSelectedGrade(grade);
                  // Remember the selected grade
                  if (grade) {
                    sessionStorage.setItem('allStudentsSelectedGrade', grade);
                  } else {
                    sessionStorage.removeItem('allStudentsSelectedGrade');
                  }
                }}
                isOpen={openDropdown === 'grade'}
                onToggle={() => setOpenDropdown(openDropdown === 'grade' ? null : 'grade')}
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
                    sessionStorage.setItem('allStudentsSelectedCenter', center);
                  } else {
                    sessionStorage.removeItem('allStudentsSelectedCenter');
                  }
                }}
                isOpen={openDropdown === 'center'}
                onToggle={() => setOpenDropdown(openDropdown === 'center' ? null : 'center')}
                onClose={() => setOpenDropdown(null)}
              />
            </div>
          </div>
          

        </div>
        <div className="history-container">
          <div className="history-title">
            All Students ({filteredStudents.length} records)
          </div>
          {error && (
            <div style={{
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
              textAlign: 'center',
              fontWeight: 600,
              border: '1.5px solid #fca5a5',
              fontSize: '1.1rem',
              boxShadow: '0 4px 16px rgba(220, 53, 69, 0.08)'
            }}>
              {error.message || "Failed to fetch students data"}
            </div>
          )}
          <SessionTable
            data={filteredStudents}
            height={400}
            showMainCenter={true}
            showGrade={true}
            showSchool={true}
            showComment={false}
            showMainComment={false}
            showWeekComment={false}
            showWhatsApp={false}
            showMessageState={false}
            emptyMessage={searchTerm
              ? "No students found with the search term."
              : "No students found."
            }
          />
        </div>
        <style jsx>{`
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
          .history-container {
            background: white;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            overflow-x: auto;
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
          .phone-number {
            font-family: monospace;
            font-size: 0.9rem;
          }
          
          @media (max-width: 768px) {
            .filters-container {
              padding: 16px;
            }
            .filter-row {
              flex-direction: column;
              gap: 8px;
            }
            .filter-group {
              min-width: auto;
            }
            .history-container {
              padding: 16px;
            }
            .history-title {
              font-size: 1.3rem;
            }
          }
          
          @media (max-width: 480px) {
            .filters-container {
              padding: 12px;
            }
            .history-container {
              padding: 12px;
            }
            .history-title {
              font-size: 1.2rem;
            }
          }
        `}</style>
      </div>
    </div>
  );
} 