import { useState, useRef, useEffect } from 'react';
import cx from 'clsx';
import { ScrollArea, Table } from '@mantine/core';
import classes from './TableScrollArea.module.css';
import WhatsAppButton from './WhatsAppButton.jsx';

export function SessionTable({ 
  data, 
  showHW = false, 
  showPaid = false, 
  showQuiz = false, 
  height = 300,
  emptyMessage = "No students found",
  showMainCenter = true,
  showWhatsApp = true,
  onMessageStateChange
}) {
  const [scrolled, setScrolled] = useState(false);
  const [needsScroll, setNeedsScroll] = useState(false);
  const tableRef = useRef(null);
  
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
      {showPaid && (
        <Table.Td style={{ textAlign: 'center', width: '120px', minWidth: '120px' }}>
          {student.paidSession ? (
            <span style={{ color: '#28a745', fontSize: '15px', fontWeight: 'bold' }}>✓ Paid</span>
          ) : (
            <span style={{ color: '#dc3545', fontSize: '15px', fontWeight: 'bold' }}>✗ Not Paid</span>
          )}
        </Table.Td>
      )}
      {showQuiz && <Table.Td style={{ textAlign: 'center', width: '140px', minWidth: '140px' }}>{student.quizDegree !== undefined && student.quizDegree !== null && student.quizDegree !== '' ? student.quizDegree : '0/0'}</Table.Td>}
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
    </Table.Tr>
  ));

  const getMinWidth = () => {
    // Use smaller widths when table is empty
    if (data.length === 0) {
      let baseWidth = showMainCenter ? 400 : 320; // Compact widths for empty table
      if (showHW) baseWidth += 80;
      if (showPaid) baseWidth += 80;
      if (showQuiz) baseWidth += 100;
      baseWidth += 80; // Message State column
      if (showWhatsApp && data.length > 0) baseWidth += 80;
      return baseWidth;
    } else {
      // Calculate based on actual column widths: ID(60) + Name(120) + Parents(140) + MainCenter(120) + MessageState(120) + WhatsApp(120)
      let baseWidth = 60 + 120 + 140; // ID + Name + Parents No.
      if (showMainCenter) baseWidth += 120; // Main Center
      if (showHW) baseWidth += 120; // HW State
      if (showPaid) baseWidth += 120; // Paid State
      if (showQuiz) baseWidth += 140; // Quiz Degree
      baseWidth += 120; // Message State column
      if (showWhatsApp && data.length > 0) baseWidth += 120; // WhatsApp Message
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
          {showPaid && <Table.Th style={{ minWidth: data.length === 0 ? '70px' : '120px', width: '120px', textAlign: 'center' }}>Paid State</Table.Th>}
          {showQuiz && <Table.Th style={{ minWidth: data.length === 0 ? '80px' : '140px', width: '140px', textAlign: 'center' }}>Quiz Degree</Table.Th>}
          <Table.Th style={{ minWidth: data.length === 0 ? '80px' : '120px', width: '120px', textAlign: 'center' }}>Message State</Table.Th>
          {showWhatsApp && data.length > 0 && <Table.Th style={{ minWidth: data.length === 0 ? '70px' : '120px', width: '120px', textAlign: 'center' }}>WhatsApp Message</Table.Th>}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {data.length === 0 ? (
          <Table.Tr>
            <Table.Td 
              colSpan={1 + (showMainCenter ? 1 : 0) + (showHW ? 1 : 0) + (showPaid ? 1 : 0) + (showQuiz ? 1 : 0) + 1 + (showWhatsApp ? 1 : 0)} 
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