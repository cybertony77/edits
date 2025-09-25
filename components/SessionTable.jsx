import { useState, useRef, useEffect } from 'react';
import cx from 'clsx';
import { ScrollArea, Table, Modal } from '@mantine/core';
import classes from './TableScrollArea.module.css';
import WhatsAppButton from './WhatsAppButton.jsx';

export function SessionTable({ 
  data, 
  showHW = false, 
  showQuiz = false, 
  showComment = false,
  showMainComment = false,
  showWeekComment = false,
  height = 300,
  emptyMessage = "No students found",
  showMainCenter = true,
  showWhatsApp = true,
  onMessageStateChange,
  showStatsColumns = false
}) {
  const [scrolled, setScrolled] = useState(false);
  const [needsScroll, setNeedsScroll] = useState(false);
  const tableRef = useRef(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTitle, setDetailsTitle] = useState('');
  const [detailsWeeks, setDetailsWeeks] = useState([]);
  const [detailsStudent, setDetailsStudent] = useState(null);
  
  // Use 100px height when table is empty, otherwise use the provided height
  const tableHeight = data.length === 0 ? 100 : height;
  
  // Only show scroll area when there's actual data
  useEffect(() => {
    setNeedsScroll(data.length > 0);
  }, [data]);

  // Handle WhatsApp message sent - database handles the state now
  const handleMessageSent = (studentId, sent) => {
    console.log('Message sent for student:', studentId, 'Status:', sent);
    
    // Call the parent callback if provided (for any additional logic)
    if (onMessageStateChange) {
      onMessageStateChange(studentId, sent);
    }
  };

  // Helpers to derive week lists for modal
  const getAbsentWeeks = (weeks) => {
    if (!Array.isArray(weeks)) return [];
    return weeks
      .map((w, idx) => ({ idx, w }))
      .filter(({ w }) => w && w.attended === false)
      .map(({ idx, w }) => ({
        week: (w.week ?? idx + 1),
        attended: w.attended,
        hwDone: w.hwDone,
        quizDegree: w.quizDegree,
        lastAttendance: w.lastAttendance,
        center: w.lastAttendanceCenter
      }));
  };

  const getMissingHWWeeks = (weeks) => {
    if (!Array.isArray(weeks)) return [];
    return weeks
      .map((w, idx) => ({ idx, w }))
      .filter(({ w }) => w && w.hwDone === false)
      .map(({ idx, w }) => ({
        week: (w.week ?? idx + 1),
        attended: w.attended,
        hwDone: w.hwDone,
        quizDegree: w.quizDegree,
        lastAttendance: w.lastAttendance,
        center: w.lastAttendanceCenter
      }));
  };

  const getUnattendQuizWeeks = (weeks) => {
    if (!Array.isArray(weeks)) return [];
    return weeks
      .map((w, idx) => ({ idx, w }))
      .filter(({ w }) => w && (w.quizDegree === "Didn't Attend The Quiz" || w.quizDegree == null))
      .map(({ idx, w }) => ({
        week: (w.week ?? idx + 1),
        attended: w.attended,
        hwDone: w.hwDone,
        quizDegree: w.quizDegree,
        lastAttendance: w.lastAttendance,
        center: w.lastAttendanceCenter
      }));
  };

  const openDetails = (student, type) => {
    let title = '';
    let weeksList = [];
    if (type === 'absent') {
      title = `Absent Sessions for ${student.name ?? student.id} • ID: ${student.id}`;
      weeksList = getAbsentWeeks(student.weeks);
    } else if (type === 'hw') {
      title = `Missing Homework for ${student.name ?? student.id} • ID: ${student.id}`;
      weeksList = getMissingHWWeeks(student.weeks);
    } else if (type === 'quiz') {
      title = `Unattended Quizzes for ${student.name ?? student.id} • ID: ${student.id}`;
      weeksList = getUnattendQuizWeeks(student.weeks);
    }
    setDetailsStudent(student);
    setDetailsTitle(title);
    setDetailsWeeks(weeksList);
    setDetailsType(type);
    setDetailsOpen(true);
  };

  const [detailsType, setDetailsType] = useState('absent');

  const rows = data.map((student) => (
    <Table.Tr key={student.id}>
      <Table.Td style={{ fontWeight: 'bold', color: '#1FA8DC', width: '60px', minWidth: '60px', textAlign: 'center' }}>{student.id}</Table.Td>
      <Table.Td style={{ width: '120px', minWidth: '120px', textAlign: 'center' }}>{student.name}</Table.Td>
      <Table.Td style={{ width: '140px', minWidth: '140px', fontFamily: 'monospace', fontSize: '0.9rem', textAlign: 'center' }}>{student.parents_phone || student.parentsPhone || ''}</Table.Td>
      {showMainCenter && <Table.Td style={{ textAlign: 'center', width: '120px', minWidth: '120px' }}>{student.main_center}</Table.Td>}
      {showHW && (
        <Table.Td style={{ textAlign: 'center', width: '120px', minWidth: '120px' }}>
          {student.hwDone ? (
            <span style={{ color: '#28a745', fontSize: '15px', fontWeight: 'bold' }}>✓ Done</span>
          ) : (
            <span style={{ color: '#dc3545', fontSize: '15px', fontWeight: 'bold' }}>✗ Not Done</span>
          )}
        </Table.Td>
      )}
      
      {showQuiz && (
        <Table.Td style={{ textAlign: 'center', width: '140px', minWidth: '140px' }}>
          {(() => {
            const value = (student.quizDegree !== undefined && student.quizDegree !== null && student.quizDegree !== '') ? student.quizDegree : '0/0';
            if (value === "Didn't Attend The Quiz") {
              return <span style={{ color: '#dc3545', fontWeight: 'bold' }}>✗ Didn't Attend The Quiz</span>;
            }
            return value;
          })()}
        </Table.Td>
      )}
      {(showComment || showMainComment) && (
        <Table.Td style={{ textAlign: 'center', width: '160px', minWidth: '160px' }}>
          {(() => {
            const mainCommentRaw = (student.main_comment ?? '').toString();
            return mainCommentRaw.trim() !== '' ? mainCommentRaw : 'No Comment';
          })()}
        </Table.Td>
      )}
      {(showComment || showWeekComment) && (
        <Table.Td style={{ textAlign: 'center', width: '160px', minWidth: '160px' }}>
          {(() => {
            try {
              // Only use the week's comment; do not fall back to main or root comment
              const idx = (typeof student.currentWeekNumber === 'number' && !isNaN(student.currentWeekNumber))
                ? (student.currentWeekNumber - 1)
                : -1;
              const fromWeeks = (idx >= 0 && Array.isArray(student.weeks)) ? (student.weeks[idx]?.comment ?? '').toString() : '';
              return fromWeeks.trim() !== '' ? fromWeeks : 'No Comment';
            } catch {
              return 'No Comment';
            }
          })()}
        </Table.Td>
      )}
      <Table.Td style={{ 
        textAlign: 'center', 
        verticalAlign: 'middle',
        fontSize: '12px',
        fontWeight: '500',
        width: '120px',
        minWidth: '120px'
      }}>
        {student.message_state ? (
          <span style={{ color: '#28a745', fontWeight: 'bold' }}>✓ Sent</span>
        ) : (
          <span style={{ color: '#dc3545', fontWeight: 'bold' }}>✗ Not Sent</span>
        )}
      </Table.Td>
      {showWhatsApp && data.length > 0 && (
        <Table.Td style={{ 
          textAlign: 'center', 
          verticalAlign: 'middle',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          width: '120px',
          minWidth: '120px'
        }}>
          <WhatsAppButton 
            student={student} 
            onMessageSent={handleMessageSent}
          />
        </Table.Td>
      )}
      {showStatsColumns && (
        <>
          <Table.Td style={{ textAlign: 'center', width: '140px', minWidth: '140px', cursor: 'pointer', fontWeight: 700, color: '#dc3545' }}
            onClick={() => openDetails(student, 'absent')}
            title="Show absent weeks">
            {Array.isArray(student.weeks) ? student.weeks.filter(w => w && w.attended === false).length : 0}
          </Table.Td>
          <Table.Td style={{ textAlign: 'center', width: '160px', minWidth: '160px', cursor: 'pointer', fontWeight: 700, color: '#fd7e14' }}
            onClick={() => openDetails(student, 'hw')}
            title="Show missing homework weeks">
            {Array.isArray(student.weeks) ? student.weeks.filter(w => w && w.hwDone === false).length : 0}
          </Table.Td>
          <Table.Td style={{ textAlign: 'center', width: '200px', minWidth: '200px', cursor: 'pointer', fontWeight: 700, color: '#1FA8DC' }}
            onClick={() => openDetails(student, 'quiz')}
            title="Show unattended quiz weeks">
            {Array.isArray(student.weeks) ? student.weeks.filter(w => w && (w.quizDegree === "Didn't Attend The Quiz" || w.quizDegree == null)).length : 0}
          </Table.Td>
        </>
      )}
    </Table.Tr>
  ));

  const getMinWidth = () => {
    // Use smaller widths when table is empty
    if (data.length === 0) {
      let baseWidth = showMainCenter ? 400 : 320; // Compact widths for empty table
      if (showHW) baseWidth += 80;
      if (showQuiz) baseWidth += 100;
      if (showComment || showMainComment) baseWidth += 160; // Main Comment
      if (showComment || showWeekComment) baseWidth += 160; // Week Comment
      baseWidth += 80; // Message State column
      if (showWhatsApp && data.length > 0) baseWidth += 80;
      return baseWidth;
    } else {
      // Calculate based on actual column widths: ID(60) + Name(120) + Parents(140) + MainCenter(120) + MessageState(120) + WhatsApp(120)
      let baseWidth = 60 + 120 + 140; // ID + Name + Parents No.
      if (showMainCenter) baseWidth += 120; // Main Center
      if (showHW) baseWidth += 120; // HW State
      if (showQuiz) baseWidth += 140; // Quiz Degree
      if (showComment || showMainComment) baseWidth += 160; // Main Comment
      if (showComment || showWeekComment) baseWidth += 160; // Week Comment
      baseWidth += 120; // Message State column
      if (showWhatsApp && data.length > 0) baseWidth += 120; // WhatsApp Message
      if (showStatsColumns) {
        baseWidth += 140; // Total absent sessions
        baseWidth += 160; // Total missing homework
        baseWidth += 200; // Total unattend quizzes
      }
      return baseWidth;
    }
  };

  const tableContent = (
    <Table ref={tableRef} style={{ width: '100%', tableLayout: 'fixed' }}>
      <Table.Thead className={cx(classes.header, { [classes.scrolled]: scrolled })}>
        <Table.Tr>
          <Table.Th style={{ minWidth: data.length === 0 ? '40px' : '60px', width: '60px', textAlign: 'center' }}>ID</Table.Th>
          <Table.Th style={{ minWidth: data.length === 0 ? '80px' : '120px', width: '120px', textAlign: 'center' }}>Name</Table.Th>
          <Table.Th style={{ minWidth: data.length === 0 ? '80px' : '140px', width: '140px', textAlign: 'center' }}>Parents No.</Table.Th>
          {showMainCenter && <Table.Th style={{ minWidth: data.length === 0 ? '80px' : '120px', width: '120px', textAlign: 'center' }}>Main Center</Table.Th>}
          {showHW && <Table.Th style={{ minWidth: data.length === 0 ? '70px' : '120px', width: '120px', textAlign: 'center' }}>HW State</Table.Th>}
          
          {showQuiz && <Table.Th style={{ minWidth: data.length === 0 ? '80px' : '140px', width: '140px', textAlign: 'center' }}>Quiz Degree</Table.Th>}
          {(showComment || showMainComment) && <Table.Th style={{ minWidth: data.length === 0 ? '120px' : '160px', width: '160px', textAlign: 'center' }}>Main Comment</Table.Th>}
          {(showComment || showWeekComment) && <Table.Th style={{ minWidth: data.length === 0 ? '120px' : '160px', width: '160px', textAlign: 'center' }}>Week Comment</Table.Th>}
          <Table.Th style={{ minWidth: data.length === 0 ? '80px' : '120px', width: '120px', textAlign: 'center' }}>Message State</Table.Th>
          {showWhatsApp && data.length > 0 && <Table.Th style={{ minWidth: data.length === 0 ? '70px' : '120px', width: '120px', textAlign: 'center' }}>WhatsApp Message</Table.Th>}
          {showStatsColumns && (
            <>
              <Table.Th style={{ minWidth: data.length === 0 ? '100px' : '140px', width: '140px', textAlign: 'center' }}>Total Absent Sessions</Table.Th>
              <Table.Th style={{ minWidth: data.length === 0 ? '120px' : '160px', width: '160px', textAlign: 'center' }}>Total Missing Homework</Table.Th>
              <Table.Th style={{ minWidth: data.length === 0 ? '140px' : '160px', width: '160px', textAlign: 'center' }}>Total Unattend Quizzes</Table.Th>
            </>
          )}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {data.length === 0 ? (
          <Table.Tr>
              <Table.Td 
              colSpan={1 + 1 + 1 + (showMainCenter ? 1 : 0) + (showHW ? 1 : 0) + (showQuiz ? 1 : 0) + (showComment ? 1 : 0) + (showComment ? 1 : 0) + 1 + (showWhatsApp ? 1 : 0) + (showStatsColumns ? 3 : 0)} 
              style={{ 
                border: 'none', 
                padding: 0,
                textAlign: 'center',
                verticalAlign: 'middle',
                width: '100%'
              }}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '80px', 
                textAlign: 'center', 
                width: '100%',
                color: '#6c757d',
                fontSize: '1rem',
                fontWeight: '500',
                padding: '20px'
              }}>
                {emptyMessage}
              </div>
            </Table.Td>
          </Table.Tr>
        ) : (
          rows
        )}
      </Table.Tbody>
    </Table>
  );

  return (
    <div style={{ height: tableHeight, overflow: 'hidden', width: '100%', position: 'relative' }}>
      <Modal
        opened={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={detailsTitle}
        centered
        radius="md"
        withCloseButton
        closeButtonProps={{
          variant: 'transparent',
          style: { color: '#dc3545' },
          'aria-label': 'Close details'
        }}
        overlayProps={{ opacity: 0.15, blur: 2 }}
      >
        {(!detailsWeeks || detailsWeeks.length === 0) ? (
          <div style={{ textAlign: 'center', color: '#6c757d', fontWeight: 600 }}>No weeks records found.</div>
        ) : (
          <div>
            
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: '140px', textAlign: 'center' }}>Week</Table.Th>
                  <Table.Th style={{ textAlign: 'center' }}>
                    {detailsType === 'absent' && 'Attendance Info'}
                    {detailsType === 'hw' && 'Homework Status'}
                    {detailsType === 'quiz' && 'Quiz Degree Status'}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {detailsWeeks.map((info) => (
                  <Table.Tr key={`${detailsStudent?.id}-${info.week}`}>
                    <Table.Td style={{ textAlign: 'center' }}>Week {String(info.week).padStart(2, '0')}</Table.Td>
                    <Table.Td style={{ textAlign: 'center' }}>
                      {detailsType === 'absent' && (
                        <span style={{ color: '#dc3545', fontWeight: 700 }}>❌ Absent</span>
                      )}
                      {detailsType === 'hw' && (
                        <span style={{ color: '#dc3545', fontWeight: 700 }}>❌ Not Done</span>
                      )}
                      {detailsType === 'quiz' && (
                        <span style={{ color: '#dc3545', fontWeight: 700 }}>
                          {info.quizDegree == null ? '0/0' : (info.quizDegree === "Didn't Attend The Quiz" ? "❌ Didn't Attend The Quiz" : String(info.quizDegree))}
                        </span>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )}
      </Modal>
      {needsScroll ? (
        <ScrollArea 
          h={tableHeight} 
          type="hover" 
          onScrollPositionChange={({ y }) => setScrolled(y !== 0)}
        >
          {data.length === 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: '100%',
              color: '#6c757d',
              fontSize: '1rem',
              fontWeight: '500',
              textAlign: 'center'
            }}>
              {emptyMessage}
            </div>
          ) : (
            tableContent
          )}
        </ScrollArea>
      ) : (
        <div style={{ height: '100%', overflow: 'hidden', width: '100%' }}>
          {data.length === 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: '100%',
              color: '#6c757d',
              fontSize: '1rem',
              fontWeight: '500',
              textAlign: 'center'
            }}>
              {emptyMessage}
            </div>
          ) : (
            tableContent
          )}
        </div>
      )}
    </div>
  );
} 