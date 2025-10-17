import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function MockExamChart({ mockExams }) {
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
    <div>
      <div style={{
        textAlign: 'center',
        marginBottom: '20px',
        fontSize: '1.2rem',
        fontWeight: '600',
        color: '#495057'
      }}>
        Mock Exam Performance Over Time
      </div>
      
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
          <XAxis 
            dataKey="exam" 
            stroke="#6c757d"
            fontSize={12}
            tick={{ fill: '#495057' }}
          />
          <YAxis 
            stroke="#6c757d"
            fontSize={12}
            tick={{ fill: '#495057' }}
            domain={[0, 100]}
            label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
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
          />
        </BarChart>
      </ResponsiveContainer>
      
    </div>
  );
}
