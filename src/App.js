import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './App.css';

const IndustrialHealthDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Checking...');
  const [dataSource, setDataSource] = useState('Unknown');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [latestValues, setLatestValues] = useState({
    timestamp: new Date().toLocaleTimeString(),
    temperature: 0,
    humidity: 0,
    oilLevel: 0,
    voltage: 0,
    current: 0,
    power: 0,
    energy: 0,
    angle: 0
  });

  // Google Sheet ID from your provided URL
  const SHEET_ID = '1kMIFbO2SZtQy-d_G5qGLLADygHX3W-7WCVI-V9BWH-A';
  const SHEET_NAME = 'Sheet1'; // Adjust if needed

  // Function to fetch data from Google Sheets
  const fetchGoogleSheetData = async () => {
    try {
      setLoading(true);
      setConnectionStatus('Connecting to Google Sheet...');
      
      // Using Google Sheets API in a way that's accessible without authentication
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Sheet may not be public or accessible`);
      }
      
      const text = await response.text();
      
      // Parse the JSONP-like response (Google's format)
      // Remove the prefix and suffix to get the JSON
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}') + 1;
      const jsonData = JSON.parse(text.substring(jsonStart, jsonEnd));
      
      if (jsonData.table && jsonData.table.rows && jsonData.table.rows.length > 0) {
        // Get column headers from the table
        const headers = jsonData.table.cols.map(col => col.label);
        
        // Process all rows for historical data
        const processedData = jsonData.table.rows.map((row, index) => {
          const rowData = {};
          
          // Map the data according to headers
          headers.forEach((header, colIndex) => {
            if (row.c[colIndex] && (row.c[colIndex].v !== null)) {
              // Use formatted value if available, otherwise use raw value
              rowData[header] = row.c[colIndex].f || row.c[colIndex].v;
            } else {
              rowData[header] = null;
            }
          });
          
          // Transform data keys to match our expected format
          return {
            timestamp: rowData['Time'] || new Date().toLocaleTimeString(),
            date: rowData['Date'] || new Date().toLocaleDateString(),
            temperature: parseFloat(rowData['Temperature']) || 0,
            humidity: parseFloat(rowData['Humidity (%)']) || 0,
            oilLevel: parseFloat(rowData['Oil Level (%)']) || 0,
            voltage: parseFloat(rowData['Voltage (V)']) || 0,
            current: parseFloat(rowData['Current (mA)']) || 0,
            power: parseFloat(rowData['Power (mW)']) || 0,
            energy: parseFloat(rowData['Energy (Wh)']) || 0,
            angle: parseFloat(rowData['Angle (°)']) || 0
            // Impact is excluded as requested
          };
        });
        
        // Get latest values for the cards
        const latestRow = processedData[processedData.length - 1];
        
        setConnectionStatus('✅ Connected to Google Sheet');
        setDataSource('Google Sheet (Live Data)');
        setData(processedData);
        setLatestValues(latestRow);
        setLastUpdate(new Date().toLocaleString());
        setLoading(false);
        
        console.log(`✅ SUCCESS: Fetched data from Google Sheet - ${processedData.length} rows`);
        return processedData;
      } else {
        throw new Error('No data found in Google Sheet');
      }
    } catch (error) {
      console.error('❌ ERROR: Could not fetch from Google Sheet:', error.message);
      setConnectionStatus('❌ Using Fallback Data - Check Sheet Permissions');
      setDataSource('Fallback Data (Not from Sheet)');
      setLoading(false);
      setError(`Failed to fetch data: ${error.message}. Make sure your Google Sheet is publicly accessible with the "Anyone with the link" viewing permission.`);
      
      // Generate fallback data to prevent app crash
      return generateFallbackData();
    }
  };

  // Generate fallback data if we can't access the sheet
  const generateFallbackData = () => {
    const fallbackData = [];
    const now = new Date();
    
    // Generate 20 data points with 1-minute intervals
    for (let i = 20; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60000);
      fallbackData.push({
        timestamp: time.toLocaleTimeString(),
        date: time.toLocaleDateString(),
        temperature: (25 + Math.random() * 5).toFixed(1),
        humidity: (60 + Math.random() * 10).toFixed(1),
        oilLevel: i % 5 === 0 ? 100 : 0,
        voltage: (9 + Math.random()).toFixed(1),
        current: Math.floor(50 + Math.random() * 250),
        power: Math.floor(500 + Math.random() * 2000),
        energy: (0.001 + Math.random() * 0.05).toFixed(3),
        angle: (Math.random() * 40 * (Math.random() > 0.5 ? 1 : -1)).toFixed(1)
      });
    }
    
    // Set the latest values for cards
    setLatestValues(fallbackData[fallbackData.length - 1]);
    setData(fallbackData);
    return fallbackData;
  };

  // Initial data fetch and setup polling for real-time updates
  useEffect(() => {
    fetchGoogleSheetData();
    
    // Poll for new data every 10 seconds for real-time updates
    const intervalId = setInterval(fetchGoogleSheetData, 10000);
    
    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  // Function to format values with appropriate precision
  const formatValue = (value, precision = 1) => {
    if (value === undefined || value === null) return '—';
    return typeof value === 'number' ? value.toFixed(precision) : value;
  };

  // Reusable styled card component
  const MetricCard = ({ title, value, unit, color1, color2, icon, secondaryValue = null, secondaryLabel = null }) => {
    const cardStyle = {
      background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`
    };

    return (
      <div className="metric-card" style={cardStyle}>
        <div className="metric-card-header">
          <h3 className="metric-card-title">{title}</h3>
          <div className="metric-card-icon">{icon}</div>
        </div>
        <div className="metric-card-value-container">
          <p className="metric-card-value">
            {value} <span className="metric-card-unit">{unit}</span>
          </p>
          {secondaryValue && (
            <div className="metric-card-secondary">
              <span>{secondaryLabel}: {secondaryValue}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Chart component with gradient background
  const MetricChart = ({ title, data, dataKey, color, unit }) => {
    const gradientId = `gradient-${dataKey}`;
    
    return (
      <div className="chart-container">
        <h3 className="chart-title">{title}</h3>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0.2}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="timestamp" 
                tick={{ fontSize: 9 }} 
                tickFormatter={(value) => value.split(':').slice(0, 2).join(':')}
              />
              <YAxis unit={unit} tick={{ fontSize: 9 }} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontSize: '11px' }}
                formatter={(value) => [`${value} ${unit}`, title]}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Line 
                type="monotone" 
                dataKey={dataKey} 
                stroke={color} 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: color, strokeWidth: 1 }}
                fill={`url(#${gradientId})`}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      {/* Header with status and controls */}
      <div className="header-card">
        <div className="header-container">
          <div>
            <h1 className="dashboard-title">Industrial Health Dashboard</h1>
            <p className="dashboard-subtitle">Real-time equipment monitoring</p>
          </div>
          <div className="status-container">
            {loading ? (
              <div className="loading-indicator">
                <div className="loading-dot"></div>
                <span className="loading-text">Refreshing data...</span>
              </div>
            ) : (
              <div className="status-container">
                <div className={`status-indicator ${connectionStatus.includes('✅') ? 'status-indicator-green' : 'status-indicator-red'}`}></div>
                <span className="status-text">Last updated: {lastUpdate}</span>
                <button 
                  onClick={fetchGoogleSheetData}
                  className="refresh-button"
                >
                  Refresh Now
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Connection Status Details */}
        <div className="connection-details">
          <div className="connection-item">
            <span className={`status-indicator ${connectionStatus.includes('✅') ? 'status-indicator-green' : 'status-indicator-yellow'}`}></span>
            <span className="connection-item-label">Connection Status:</span>
            <span className="connection-item-value">{connectionStatus}</span>
          </div>
          <div className="connection-item">
            <span className="connection-item-label">Data Source:</span>
            <span className="connection-item-value">{dataSource}</span>
          </div>
          
          {!connectionStatus.includes('✅') && (
            <div className="connection-help">
              <p className="connection-help-title">⚠️ To enable live data access:</p>
              <ol className="connection-help-list">
                <li>Open your Google Sheet: <a href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`} target="_blank" rel="noopener noreferrer" className="sheet-link">Click here</a></li>
                <li>Click "Share" → Change to "Anyone with the link" → Set to "Viewer"</li>
                <li>Refresh this dashboard</li>
              </ol>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="error-alert">
          {error}
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="metrics-grid">
        {/* Temperature Card */}
        <MetricCard 
          title="Temperature" 
          value={formatValue(latestValues.temperature)} 
          unit="°C" 
          color1="#FF6B6B" 
          color2="#FF8E8E" 
          icon="🌡️" 
        />
        
        {/* Humidity Card */}
        <MetricCard 
          title="Humidity" 
          value={formatValue(latestValues.humidity)} 
          unit="%" 
          color1="#4ECDC4" 
          color2="#6BE3D9" 
          icon="💧" 
        />
        
        {/* Oil Level Card */}
        <MetricCard 
          title="Oil Level" 
          value={formatValue(latestValues.oilLevel)} 
          unit="%" 
          color1="#FFD166" 
          color2="#FFDA85" 
          icon="🛢️" 
        />
        
        {/* Voltage Card */}
        <MetricCard 
          title="Voltage" 
          value={formatValue(latestValues.voltage)} 
          unit="V" 
          color1="#6246EA" 
          color2="#7E68EE" 
          icon="⚡" 
        />
        
        {/* Current Card */}
        <MetricCard 
          title="Current" 
          value={formatValue(latestValues.current, 0)} 
          unit="mA" 
          color1="#3A86FF" 
          color2="#5C9AFF" 
          icon="🔌" 
        />
        
        {/* Power Card */}
        <MetricCard 
          title="Power" 
          value={formatValue(latestValues.power, 0)} 
          unit="mW" 
          color1="#F72585" 
          color2="#FA5A9C" 
          icon="⚡" 
        />
        
        {/* Energy Card */}
        <MetricCard 
          title="Energy" 
          value={formatValue(latestValues.energy, 3)} 
          unit="Wh" 
          color1="#2EC4B6" 
          color2="#4ED6C9" 
          icon="🔋" 
        />
        
        {/* Angle Card */}
        <MetricCard 
          title="Angle" 
          value={formatValue(latestValues.angle, 1)} 
          unit="°" 
          color1="#9D4EDD" 
          color2="#B77BEB" 
          icon="📐" 
        />
      </div>

      {/* Charts Grid */}
      <div className="charts-section">
        <h2 className="charts-title">Performance Trends</h2>
        <div className="charts-grid">
          <MetricChart 
            title="Temperature Trend" 
            data={data} 
            dataKey="temperature" 
            color="#FF6B6B" 
            unit="°C" 
          />
          
          <MetricChart 
            title="Humidity Trend" 
            data={data} 
            dataKey="humidity" 
            color="#4ECDC4" 
            unit="%" 
          />
          
          <MetricChart 
            title="Oil Level Trend" 
            data={data} 
            dataKey="oilLevel" 
            color="#FFD166" 
            unit="%" 
          />
          
          <MetricChart 
            title="Voltage Trend" 
            data={data} 
            dataKey="voltage" 
            color="#6246EA" 
            unit="V" 
          />
          
          <MetricChart 
            title="Current Trend" 
            data={data} 
            dataKey="current" 
            color="#3A86FF" 
            unit="mA" 
          />
          
          <MetricChart 
            title="Power Trend" 
            data={data} 
            dataKey="power" 
            color="#F72585" 
            unit="mW" 
          />
          
          <MetricChart 
            title="Energy Consumption" 
            data={data} 
            dataKey="energy" 
            color="#2EC4B6" 
            unit="Wh" 
          />
          
          <MetricChart 
            title="Angle Variation" 
            data={data} 
            dataKey="angle" 
            color="#9D4EDD" 
            unit="°" 
          />
        </div>
      </div>

      {/* Footer Status Area */}
      <div className="footer">
        <p>Industrial Health Monitoring System • Data updates every 10 seconds</p>
        <p className="footer-detail">Sheet ID: {SHEET_ID} • Powered by Google Sheets Integration</p>
        <p className="footer-detail">
          {connectionStatus.includes('✅') 
            ? '✅ LIVE DATA: Successfully reading from your Google Sheet!' 
            : '⚠️ FALLBACK DATA: Using generated values - check Google Sheet permissions'}
        </p>
      </div>
    </div>
  );
};

export default IndustrialHealthDashboard;