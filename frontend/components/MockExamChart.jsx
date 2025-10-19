import { useState, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function MockExamChart({ mockExams }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipData, setTooltipData] = useState(null);
  const chartRef = useRef(null);

  // Handle click outside to hide tooltip
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (chartRef.current && !chartRef.current.contains(event.target)) {
        setShowTooltip(false);
        setTooltipData(null);
      }
    };

    const handleTouchOutside = (event) => {
      if (chartRef.current && !chartRef.current.contains(event.target)) {
        setShowTooltip(false);
        setTooltipData(null);
      }
    };

    // Add event listeners for both mouse and touch events
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleTouchOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleTouchOutside);
    };
  }, []);
  if (!mockExams || mockExams.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: '#6c757d',
        fontSize: '1.1rem',
        fontWeight: '500',
        background: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        📊 No mock exams data to display yet
      </div>
    );
  }

  // Prepare data for the chart
  const chartData = mockExams.map((exam, index) => ({
    exam: exam.exam,
    percentage: exam.percentage,
    examDegree: exam.examDegree,
    outOf: exam.outOf
  }));

  return (
    <div ref={chartRef} style={{ width: '100%', height: 500 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
          <XAxis 
            dataKey="exam" 
            stroke="#6c757d"
            fontSize={12}
            tick={{ fill: '#495057' }}
            interval={0} 
            angle={-20} 
            textAnchor="end" 
            height={50}
          />
          <YAxis 
            stroke="#6c757d"
            fontSize={12}
            tick={{ fill: '#495057' }}
            domain={[0, 100]}
            label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            active={showTooltip}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
            formatter={(value, name, props) => {
              const exam = props.payload.exam;
              const percentage = value.toFixed(1);
              const examDegree = props.payload.examDegree;
              const outOf = props.payload.outOf;
              return [
                <div key="tooltip" style={{ color: '#000000' }}>
                  <div><strong style={{ color: '#000000' }}>Exam:</strong> {exam}</div>
                  {examDegree && outOf && <div><strong style={{ color: '#000000' }}>Degree:</strong> {examDegree} / {outOf}</div>}
                  <div><strong style={{ color: '#000000' }}>Percentage:</strong> {percentage}%</div>
                </div>
              ];
            }}
            labelStyle={{ display: 'none' }}
          />
          <Bar
            dataKey="percentage"
            fill="#1FA8DC"
            radius={[4, 4, 0, 0]}
            maxBarSize={50}
            onClick={(data, index) => {
              setShowTooltip(true);
              setTooltipData(data);
            }}
            onTouchStart={(data, index) => {
              setShowTooltip(true);
              setTooltipData(data);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
