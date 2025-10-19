import { useMemo, useState, useRef, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
  Cell
} from "recharts";

const COLORS = [
  "#36a2eb", "#ff6384", "#ffcd56", "#4bc0c0", "#9966ff",
  "#c9cbcf", "#2ecc71", "#e67e22", "#9b59b6", "#1abc9c"
];

function parseDegreeToNumber(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (/^didn'?t\s+attend/i.test(raw) || /no\s+quiz/i.test(raw)) return null;
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const num = parseFloat(m[1]);
    const den = parseFloat(m[2]);
    if (!isNaN(num) && !isNaN(den) && den > 0) {
      return Math.max(0, Math.min(100, (num / den) * 100));
    }
    return null;
  }
  const asNum = Number(raw);
  if (!isNaN(asNum)) {
    return Math.max(0, Math.min(100, asNum));
  }
  return null;
}

export default function QuizChart({ lessons }) {
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

  const data = useMemo(() => {
    if (!lessons) return [];
    return lessons
      .map((l) => {
        const degree = parseDegreeToNumber(l.quizDegree);
        return degree == null ? null : { 
          name: l.lesson, 
          degree,
          originalDegree: l.quizDegree
        };
      })
      .filter(Boolean);
  }, [lessons]);

  if (!data.length) {
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
        📊 No quiz data to display yet
      </div>
    );
  }

  return (
    <div ref={chartRef} style={{ width: '100%', height: 500 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
          <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={50} tick={{ fill: '#495057', fontSize: 14 }} />
          <YAxis 
            domain={[0, 100]} 
            tick={{ fill: '#495057', fontSize: 14 }}
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
              const lesson = props.payload.name;
              const percentage = value.toFixed(1);
              // Try to get the original quizDegree to show as fraction
              const originalDegree = props.payload.originalDegree;
              return [
                <div key="tooltip" style={{ color: '#000000' }}>
                  <div><strong style={{ color: '#000000' }}>Lesson:</strong> {lesson}</div>
                  {originalDegree && <div><strong style={{ color: '#000000' }}>Degree:</strong> {originalDegree}</div>}
                  <div><strong style={{ color: '#000000' }}>Percentage:</strong> {percentage}%</div>
                </div>
              ];
            }}
            labelStyle={{ display: 'none' }}
          />
          <Bar 
            dataKey="degree" 
            radius={[6, 6, 0, 0]} 
            maxBarSize={50} 
            isAnimationActive
            onClick={(data, index) => {
              setShowTooltip(true);
              setTooltipData(data);
            }}
            onTouchStart={(data, index) => {
              setShowTooltip(true);
              setTooltipData(data);
            }}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


