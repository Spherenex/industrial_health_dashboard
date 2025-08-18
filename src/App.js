import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import './App.css';

const IndustrialHealthDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Checking...');
  const [dataSource, setDataSource] = useState('Unknown');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false); // New state to track PDF export
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
    const fetchData = async () => {
      await fetchGoogleSheetData();
    };
    
    fetchData();
    
    // Poll for new data every 3 minutes (180000ms) for real-time updates
    const intervalId = setInterval(() => {
      // Only auto-refresh if not currently exporting PDF
      if (!isExportingPDF) {
        console.log('🔄 Auto-refreshing data...');
        fetchGoogleSheetData();
      } else {
        console.log('⏸️ Auto-refresh paused - PDF export in progress');
      }
    }, 180000);
    
    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExportingPDF]);

  // Function to format values with appropriate precision
  const formatValue = (value, precision = 1) => {
    if (value === undefined || value === null) return '—';
    return typeof value === 'number' ? value.toFixed(precision) : value;
  };

  // Comprehensive PDF Export Function with improved chart handling and layout
  const exportToPDF = async () => {
    // Show loading state and prevent auto-refresh during export
    setIsExportingPDF(true);
    const exportButton = document.querySelector('.export-button');
    const originalButtonText = exportButton.textContent;
    exportButton.textContent = '⏳ Generating PDF...';
    exportButton.disabled = true;

    try {
      console.log('🔄 Starting PDF export process...');
      console.log('🛑 All auto-refresh operations halted');
      
      // Wait for any pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create a new jsPDF instance in landscape for better chart display
      const pdf = new jsPDF('l', 'mm', 'a4'); // 'l' for landscape
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPosition = 25;

      // Add attractive header with company-style layout
      pdf.setFillColor(41, 128, 185); // Blue background
      pdf.rect(0, 0, pageWidth, 35, 'F');
      
      // Title
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(24);
      pdf.setFont(undefined, 'bold');
      pdf.text('INDUSTRIAL HEALTH MONITORING REPORT', pageWidth / 2, 18, { align: 'center' });
      
      // Subtitle
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'normal');
      pdf.text(`Real-time Equipment Analytics & Performance Dashboard`, pageWidth / 2, 28, { align: 'center' });

      yPosition = 50;

      // Report metadata in a styled box
      pdf.setFillColor(248, 249, 250);
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(15, yPosition - 5, pageWidth - 30, 25, 'FD');
      
      pdf.setTextColor(51, 51, 51);
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');
      
      // Left column info
      pdf.text('Report Generated:', 20, yPosition + 5);
      pdf.text('Data Source:', 20, yPosition + 12);
      pdf.text('Connection Status:', 20, yPosition + 19);
      
      pdf.setFont(undefined, 'normal');
      pdf.text(new Date().toLocaleString(), 65, yPosition + 5);
      pdf.text(dataSource, 55, yPosition + 12);
      pdf.text(connectionStatus.replace(/[✅❌⚠️]/g, ''), 75, yPosition + 19);
      
      // Right column info  
      pdf.setFont(undefined, 'bold');
      pdf.text('Total Data Points:', pageWidth - 120, yPosition + 5);
      pdf.text('Last Updated:', pageWidth - 120, yPosition + 12);
      pdf.text('Report Version:', pageWidth - 120, yPosition + 19);
      
      pdf.setFont(undefined, 'normal');
      pdf.text(data.length.toString(), pageWidth - 60, yPosition + 5);
      pdf.text(lastUpdate || 'N/A', pageWidth - 60, yPosition + 12);
      pdf.text('v2.0', pageWidth - 60, yPosition + 19);

      yPosition += 35;

      // Current readings section with better styling
      pdf.setFillColor(46, 204, 113); // Green header
      pdf.rect(15, yPosition, pageWidth - 30, 12, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont(undefined, 'bold');
      pdf.text('📊 CURRENT SYSTEM READINGS', 20, yPosition + 8);

      yPosition += 20;

      // Create an improved table for current readings with better spacing
      const metricsData = [
        ['Parameter', 'Current Value', 'Unit', 'Status', 'Timestamp'],
        ['Temperature', formatValue(latestValues.temperature), '°C', getStatusIndicator(latestValues.temperature, 20, 30), latestValues.timestamp],
        ['Humidity', formatValue(latestValues.humidity), '%', getStatusIndicator(latestValues.humidity, 40, 80), latestValues.timestamp],
        ['Oil Level', formatValue(latestValues.oilLevel), '%', getStatusIndicator(latestValues.oilLevel, 20, 100), latestValues.timestamp],
        ['Voltage', formatValue(latestValues.voltage), 'V', getStatusIndicator(latestValues.voltage, 8, 12), latestValues.timestamp],
        ['Current', formatValue(latestValues.current, 0), 'mA', getStatusIndicator(latestValues.current, 50, 300), latestValues.timestamp],
        ['Power', formatValue(latestValues.power, 0), 'mW', getStatusIndicator(latestValues.power, 500, 2500), latestValues.timestamp],
        ['Energy', formatValue(latestValues.energy, 3), 'Wh', 'Normal', latestValues.timestamp],
        ['Angle', formatValue(latestValues.angle, 1), '°', getStatusIndicator(Math.abs(latestValues.angle), 0, 45), latestValues.timestamp]
      ];

        // Draw improved table with alternating row colors
        pdf.setFontSize(9);
        const cellWidths = [60, 35, 25, 30, 40]; // Adjusted widths for landscape
        const cellHeight = 8;

        metricsData.forEach((row, rowIndex) => {
          let xPos = 15;
          
          row.forEach((cell, cellIndex) => {
            // Set background color first
            if (rowIndex === 0) {
              // Header row - dark blue background
              pdf.setFillColor(52, 73, 94);
            } else {
              // Data rows - alternating light colors
              if (rowIndex % 2 === 0) {
                pdf.setFillColor(245, 245, 245); // Very light gray
              } else {
                pdf.setFillColor(255, 255, 255); // White
              }
            }
            
            // Fill the cell background
            pdf.rect(xPos, yPosition, cellWidths[cellIndex], cellHeight, 'F');
            
            // Draw cell border
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(xPos, yPosition, cellWidths[cellIndex], cellHeight, 'D');
            
            // Now set text color and font
            if (rowIndex === 0) {
              pdf.setTextColor(255, 255, 255); // White text for header
              pdf.setFont(undefined, 'bold');
            } else {
              pdf.setTextColor(51, 51, 51); // Dark text for data
              pdf.setFont(undefined, 'normal');
            }
            
            // Center align numeric values, left align text
            const align = cellIndex === 1 || cellIndex === 2 ? 'center' : 'left';
            const textX = align === 'center' ? xPos + cellWidths[cellIndex] / 2 : xPos + 2;
            
            // Add the text
            pdf.text(String(cell), textX, yPosition + 5.5, { 
              maxWidth: cellWidths[cellIndex] - 4,
              align: align 
            });
            
            xPos += cellWidths[cellIndex];
          });
          yPosition += cellHeight;
        });      yPosition += 20;

      // Add historical data section
      if (yPosition > pageHeight - 40) {
        pdf.addPage();
        yPosition = 20;
      }

      // Simple historical summary without problematic statistics
      pdf.setFillColor(155, 89, 182); // Purple header
      pdf.rect(15, yPosition, pageWidth - 30, 12, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont(undefined, 'bold');
      pdf.text('📈 HISTORICAL DATA OVERVIEW', 20, yPosition + 8);

      yPosition += 20;

      // Add simple text summary instead of complex table
      if (data.length > 0) {
        pdf.setTextColor(51, 51, 51);
        pdf.setFontSize(12);
        pdf.setFont(undefined, 'bold');
        pdf.text(`Historical Data Summary`, 20, yPosition);
        yPosition += 10;

        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        pdf.text(`• Total data points collected: ${data.length}`, 25, yPosition);
        yPosition += 6;
        pdf.text(`• Data collection period: From ${data[0]?.date || 'N/A'} to ${data[data.length - 1]?.date || 'N/A'}`, 25, yPosition);
        yPosition += 6;
        pdf.text(`• Latest reading timestamp: ${latestValues.timestamp}`, 25, yPosition);
        yPosition += 6;
        
        // Add current values summary
        pdf.setFont(undefined, 'bold');
        pdf.text('Current System Status:', 25, yPosition);
        yPosition += 8;
        
        pdf.setFont(undefined, 'normal');
        const statusItems = [
          `Temperature: ${formatValue(latestValues.temperature)}°C`,
          `Humidity: ${formatValue(latestValues.humidity)}%`,
          `Oil Level: ${formatValue(latestValues.oilLevel)}%`,
          `Voltage: ${formatValue(latestValues.voltage)}V`,
          `Current: ${formatValue(latestValues.current, 0)}mA`,
          `Power: ${formatValue(latestValues.power, 0)}mW`,
          `Energy: ${formatValue(latestValues.energy, 3)}Wh`,
          `Angle: ${formatValue(latestValues.angle, 1)}°`
        ];
        
        statusItems.forEach((item, index) => {
          if (index % 2 === 0) {
            pdf.text(`• ${item}`, 30, yPosition);
          } else {
            pdf.text(`• ${item}`, 150, yPosition - 4); // Same line, right side
            yPosition += 4;
          }
        });
      }

      yPosition += 15;

      // Capture and add charts with improved handling and better layout
      pdf.addPage(); // Start charts on a new page
      yPosition = 25;
      
      // Charts section header
      pdf.setFillColor(231, 76, 60); // Red header for charts
      pdf.rect(15, yPosition, pageWidth - 30, 12, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont(undefined, 'bold');
      pdf.text('📈 PERFORMANCE TRENDS & ANALYTICS', 20, yPosition + 8);

      yPosition += 20;

      const chartElements = document.querySelectorAll('.chart-container');
      console.log(`Found ${chartElements.length} charts to capture`);
      
      // Update export button to show progress
      exportButton.textContent = `⏳ Stabilizing ${chartElements.length} charts...`;
      
      // Add a much longer delay to ensure all charts are fully rendered before capture
      console.log('⏳ Waiting 10 seconds for all charts to fully render...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Process charts in pairs for better layout (2 charts per row in landscape)
      const maxChartHeight = 80; // Define max height for charts
      
      for (let i = 0; i < chartElements.length; i += 2) {
        // Check if we need a new page (leaving space for 2 charts)
        if (yPosition > pageHeight - 140) {
          pdf.addPage();
          yPosition = 25;
        }

        // Process first chart in the row
        const chart1 = chartElements[i];
        const chart1Title = chart1.querySelector('.chart-title')?.textContent || `Chart ${i + 1}`;
        
        // Process second chart in the row (if exists)
        const chart2 = chartElements[i + 1];
        const chart2Title = chart2 ? chart2.querySelector('.chart-title')?.textContent || `Chart ${i + 2}` : null;

        try {
          // Capture first chart
          console.log(`Capturing chart ${i + 1}: ${chart1Title}`);
          exportButton.textContent = `📊 Capturing Chart ${i + 1}/${chartElements.length}`;
          
          // Ensure chart is visible and properly rendered
          chart1.scrollIntoView({ behavior: 'instant', block: 'center' });
          console.log(`📊 Waiting for chart ${i + 1} to stabilize...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const canvas1 = await html2canvas(chart1, {
            scale: 2,
            backgroundColor: '#ffffff',
            allowTaint: true,
            useCORS: true,
            logging: false,
            width: chart1.offsetWidth,
            height: chart1.offsetHeight,
            scrollX: 0,
            scrollY: 0,
            ignoreElements: (element) => {
              // Skip elements that might cause rendering issues
              return element.classList.contains('recharts-tooltip-wrapper');
            },
            onclone: (clonedDoc) => {
              // Ensure proper styling in cloned document
              const clonedCharts = clonedDoc.querySelectorAll('.chart-container');
              clonedCharts.forEach(chart => {
                chart.style.backgroundColor = '#ffffff';
                chart.style.padding = '15px';
                chart.style.border = '1px solid #e0e0e0';
                chart.style.borderRadius = '8px';
              });
              
              // Ensure axis text is visible
              const axisTexts = clonedDoc.querySelectorAll('.recharts-cartesian-axis-tick text');
              axisTexts.forEach(text => {
                text.style.fontSize = '11px';
                text.style.fill = '#666';
                text.style.fontFamily = 'Arial, sans-serif';
              });
            }
          });

          if (canvas1.width > 0 && canvas1.height > 0) {
            const imgData1 = canvas1.toDataURL('image/png', 1.0);
            
            // Add first chart title
            pdf.setFontSize(11);
            pdf.setTextColor(51, 51, 51);
            pdf.setFont(undefined, 'bold');
            pdf.text(chart1Title, 20, yPosition);
            
            // Calculate dimensions for first chart (left side)
            const chart1Width = (pageWidth - 50) / 2; // Half width minus margins
            const chart1Height = (canvas1.height * chart1Width) / canvas1.width;
            
            // Limit height to prevent overflow
            const maxChartHeight = 80;
            const finalChart1Height = Math.min(chart1Height, maxChartHeight);
            const finalChart1Width = chart1Height > maxChartHeight ? 
              (canvas1.width * finalChart1Height) / canvas1.height : chart1Width;
            
            pdf.addImage(imgData1, 'PNG', 20, yPosition + 5, finalChart1Width, finalChart1Height);
            console.log(`✅ Successfully captured chart: ${chart1Title}`);
          } else {
            throw new Error('Canvas has zero dimensions for chart 1');
          }

          // Capture second chart if exists
          if (chart2) {
            console.log(`Capturing chart ${i + 2}: ${chart2Title}`);
            exportButton.textContent = `📊 Capturing Chart ${i + 2}/${chartElements.length}`;
            
            chart2.scrollIntoView({ behavior: 'instant', block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const canvas2 = await html2canvas(chart2, {
              scale: 2,
              backgroundColor: '#ffffff',
              allowTaint: true,
              useCORS: true,
              logging: false,
              width: chart2.offsetWidth,
              height: chart2.offsetHeight,
              scrollX: 0,
              scrollY: 0,
              ignoreElements: (element) => {
                return element.classList.contains('recharts-tooltip-wrapper');
              },
              onclone: (clonedDoc) => {
                const clonedCharts = clonedDoc.querySelectorAll('.chart-container');
                clonedCharts.forEach(chart => {
                  chart.style.backgroundColor = '#ffffff';
                  chart.style.padding = '15px';
                  chart.style.border = '1px solid #e0e0e0';
                  chart.style.borderRadius = '8px';
                });
                
                const axisTexts = clonedDoc.querySelectorAll('.recharts-cartesian-axis-tick text');
                axisTexts.forEach(text => {
                  text.style.fontSize = '11px';
                  text.style.fill = '#666';
                  text.style.fontFamily = 'Arial, sans-serif';
                });
              }
            });

            if (canvas2.width > 0 && canvas2.height > 0) {
              const imgData2 = canvas2.toDataURL('image/png', 1.0);
              
              // Add second chart title (right side)
              const chart2X = pageWidth / 2 + 10;
              pdf.text(chart2Title, chart2X, yPosition);
              
              // Calculate dimensions for second chart (right side)
              const chart2Width = (pageWidth - 50) / 2;
              const chart2Height = (canvas2.height * chart2Width) / canvas2.width;
              
              const finalChart2Height = Math.min(chart2Height, maxChartHeight);
              const finalChart2Width = chart2Height > maxChartHeight ? 
                (canvas2.width * finalChart2Height) / canvas2.height : chart2Width;
              
              pdf.addImage(imgData2, 'PNG', chart2X, yPosition + 5, finalChart2Width, finalChart2Height);
              console.log(`✅ Successfully captured chart: ${chart2Title}`);
            } else {
              // Fallback for second chart
              const chart2X = pageWidth / 2 + 10;
              pdf.setFontSize(10);
              pdf.setTextColor(200, 0, 0);
              pdf.text(`${chart2Title} - Capture Failed`, chart2X, yPosition + 20);
            }
          }
          
          yPosition += maxChartHeight + 25; // Move to next row
          
        } catch (error) {
          console.error(`❌ Error capturing charts in row ${Math.floor(i/2) + 1}:`, error);
          
          // Fallback display for failed charts
          pdf.setFontSize(10);
          pdf.setTextColor(200, 0, 0);
          pdf.text(`${chart1Title} - Chart Capture Failed`, 20, yPosition + 10);
          
          if (chart2Title) {
            pdf.text(`${chart2Title} - Chart Capture Failed`, pageWidth / 2 + 10, yPosition + 10);
          }
          
          yPosition += 30;
        }
        
        // Add a delay between chart row captures to ensure proper rendering
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Add statistical analysis section on a new page
      pdf.addPage();
      yPosition = 25;
      
      // Statistics section header
      pdf.setFillColor(155, 89, 182); // Purple header
      pdf.rect(15, yPosition, pageWidth - 30, 12, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont(undefined, 'bold');
      pdf.text('📊 STATISTICAL ANALYSIS & SUMMARY', 20, yPosition + 8);

      yPosition += 25;

      // Add statistical summary in a professional format
      if (data.length > 0) {
        const stats = calculateStatistics();
        
        pdf.setTextColor(51, 51, 51);
        pdf.setFontSize(12);
        pdf.setFont(undefined, 'bold');
        pdf.text(`Data Analysis Summary (${data.length} data points analyzed)`, 20, yPosition);
        yPosition += 12;

        // Create statistics table
        const statsHeaders = ['Parameter', 'Current', 'Minimum', 'Maximum', 'Average', 'Status'];
        const statsData = [statsHeaders];
        
        Object.entries(stats).forEach(([metric, values]) => {
          const status = getStatusIndicator(values.current, 
            metric === 'Temperature' ? 20 : metric === 'Humidity' ? 40 : 
            metric === 'Voltage' ? 8 : metric === 'Current' ? 50 : 0, 
            metric === 'Temperature' ? 30 : metric === 'Humidity' ? 80 : 
            metric === 'Voltage' ? 12 : metric === 'Current' ? 300 : 1000);
          
          statsData.push([
            metric,
            values.current,
            values.min,
            values.max,
            values.avg,
            status
          ]);
        });

        // Draw statistics table with improved formatting
        const statsCellWidths = [50, 25, 25, 25, 25, 25];
        const statsCellHeight = 8;

        statsData.forEach((row, rowIndex) => {
          let xPos = 20;
          
          row.forEach((cell, cellIndex) => {
            // Set background colors first
            if (rowIndex === 0) {
              // Header row
              pdf.setFillColor(52, 152, 219); // Blue background
            } else {
              // Data rows with alternating colors
              if (rowIndex % 2 === 0) {
                pdf.setFillColor(248, 248, 248); // Light gray for even rows
              } else {
                pdf.setFillColor(255, 255, 255); // White for odd rows
              }
            }
            
            // Fill cell background
            pdf.rect(xPos, yPosition, statsCellWidths[cellIndex], statsCellHeight, 'F');
            
            // Draw cell border
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(xPos, yPosition, statsCellWidths[cellIndex], statsCellHeight, 'D');
            
            xPos += statsCellWidths[cellIndex];
          });
          
          // Reset position for text
          xPos = 20;
          
          row.forEach((cell, cellIndex) => {
            // Set text properties for each cell
            if (rowIndex === 0) {
              pdf.setTextColor(255, 255, 255); // White text for header
              pdf.setFont(undefined, 'bold');
            } else {
              pdf.setTextColor(51, 51, 51); // Dark gray text for data
              pdf.setFont(undefined, 'normal');
            }
            
            const align = cellIndex === 0 ? 'left' : 'center';
            const textX = align === 'center' ? xPos + statsCellWidths[cellIndex] / 2 : xPos + 2;
            
            pdf.setFontSize(9);
            pdf.text(String(cell), textX, yPosition + 5.5, { 
              maxWidth: statsCellWidths[cellIndex] - 4,
              align: align 
            });
            
            xPos += statsCellWidths[cellIndex];
          });
          
          yPosition += statsCellHeight;
        });
      }

      yPosition += 20;

      // Add raw data table on new page
      if (data.length > 0) {
        pdf.addPage();
        yPosition = 25;
        
        // Raw data section header
        pdf.setFillColor(230, 126, 34); // Orange header
        pdf.rect(15, yPosition, pageWidth - 30, 12, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.text('📋 DETAILED RAW DATA TABLE', 20, yPosition + 8);

        yPosition += 20;
        
        pdf.setTextColor(51, 51, 51);
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        pdf.text(`Showing the latest 25 data entries from ${data.length} total records`, 20, yPosition);
        yPosition += 10;
        
        // Table headers with better layout for landscape
        const headers = ['Time', 'Date', 'Temp(°C)', 'Humidity(%)', 'Oil(%)', 'Voltage(V)', 'Current(mA)', 'Power(mW)', 'Energy(Wh)', 'Angle(°)'];
        const colWidths = [25, 25, 20, 22, 18, 22, 22, 22, 22, 20]; // Adjusted for landscape
        
        pdf.setFontSize(8);
        pdf.setFont(undefined, 'bold');
        
        // Draw header row
        pdf.setFillColor(52, 73, 94);
        pdf.setTextColor(255, 255, 255);
        let xPos = 20;
        headers.forEach((header, index) => {
          pdf.rect(xPos, yPosition, colWidths[index], 8, 'F');
          pdf.setDrawColor(200, 200, 200);
          pdf.rect(xPos, yPosition, colWidths[index], 8, 'D');
          pdf.text(header, xPos + colWidths[index]/2, yPosition + 5.5, { align: 'center' });
          xPos += colWidths[index];
        });
        yPosition += 8;
        
        // Data rows (show last 25 entries to fit in pages)
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(51, 51, 51);
        const displayData = data.slice(-25);
        
        displayData.forEach((row, rowIndex) => {
          if (yPosition > pageHeight - 20) {
            pdf.addPage();
            yPosition = 25;
            
            // Redraw header on new page
            pdf.setFillColor(52, 73, 94);
            pdf.setFont(undefined, 'bold');
            xPos = 20;
            headers.forEach((header, index) => {
              pdf.rect(xPos, yPosition, colWidths[index], 8, 'F');
              pdf.setDrawColor(200, 200, 200);
              pdf.rect(xPos, yPosition, colWidths[index], 8, 'D');
              pdf.setTextColor(255, 255, 255);
              pdf.text(header, xPos + colWidths[index]/2, yPosition + 5.5, { align: 'center' });
              xPos += colWidths[index];
            });
            yPosition += 8;
          }
          
          const rowData = [
            (row.timestamp || '—').substring(0, 8), // Truncate time
            (row.date || '—').substring(0, 8), // Truncate date
            formatValue(row.temperature),
            formatValue(row.humidity),
            formatValue(row.oilLevel),
            formatValue(row.voltage),
            formatValue(row.current, 0),
            formatValue(row.power, 0),
            formatValue(row.energy, 3),
            formatValue(row.angle, 1)
          ];
          
          // Set background colors first
          xPos = 20;
          rowData.forEach((cell, cellIndex) => {
            // Alternate row colors
            if (rowIndex % 2 === 0) {
              pdf.setFillColor(248, 248, 248); // Light gray
            } else {
              pdf.setFillColor(255, 255, 255); // White
            }
            
            pdf.rect(xPos, yPosition, colWidths[cellIndex], 6, 'F');
            pdf.setDrawColor(220, 220, 220);
            pdf.rect(xPos, yPosition, colWidths[cellIndex], 6, 'D');
            xPos += colWidths[cellIndex];
          });
          
          // Now add text
          xPos = 20;
          pdf.setTextColor(51, 51, 51); // Dark text for data
          pdf.setFont(undefined, 'normal');
          
          rowData.forEach((cell, cellIndex) => {
            pdf.text(String(cell), xPos + colWidths[cellIndex]/2, yPosition + 4, { 
              maxWidth: colWidths[cellIndex] - 2, 
              align: 'center' 
            });
            xPos += colWidths[cellIndex];
          });
          yPosition += 6;
        });
      }

      // Add professional footer to all pages
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        
        // Footer background
        pdf.setFillColor(44, 62, 80);
        pdf.rect(0, pageHeight - 15, pageWidth, 15, 'F');
        
        // Footer text
        pdf.setFontSize(8);
        pdf.setTextColor(255, 255, 255);
        pdf.text(
          `Industrial Health Monitoring System | Page ${i} of ${totalPages}`,
          15,
          pageHeight - 8
        );
        
        pdf.text(
          `Generated: ${new Date().toLocaleString()} | Data Points: ${data.length}`,
          pageWidth - 15,
          pageHeight - 8,
          { align: 'right' }
        );
      }

      // Save the PDF with professional filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const fileName = `Industrial_Health_Report_${timestamp}.pdf`;
      pdf.save(fileName);
      
      console.log('✅ PDF exported successfully:', fileName);
      
    } catch (error) {
      console.error('❌ Error exporting PDF:', error);
      alert('Error generating PDF report. Please try again.');
    } finally {
      // Restore button state and allow auto-refresh again
      setIsExportingPDF(false);
      exportButton.textContent = originalButtonText;
      exportButton.disabled = false;
    }
  };

  // Helper function to calculate statistics
  const calculateStatistics = () => {
    if (data.length === 0) return {};

    const metrics = ['temperature', 'humidity', 'oilLevel', 'voltage', 'current', 'power', 'energy', 'angle'];
    const stats = {};

    metrics.forEach(metric => {
      const values = data.map(d => parseFloat(d[metric])).filter(v => !isNaN(v));
      if (values.length > 0) {
        stats[metric.charAt(0).toUpperCase() + metric.slice(1)] = {
          min: Math.min(...values).toFixed(2),
          max: Math.max(...values).toFixed(2),
          avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
          current: formatValue(latestValues[metric])
        };
      }
    });

    return stats;
  };

  // Helper functions for chart data extraction
  const getChartDataForMetric = (chartTitle) => {
    return data; // All data contains all metrics
  };

  const getDataKeyFromTitle = (title) => {
    const titleMap = {
      'Temperature Trend': 'temperature',
      'Humidity Trend': 'humidity',
      'Oil Level Trend': 'oilLevel',
      'Voltage Trend': 'voltage',
      'Current Trend': 'current',
      'Power Trend': 'power',
      'Energy Consumption': 'energy',
      'Angle Variation': 'angle'
    };
    return titleMap[title] || 'temperature';
  };

  const getUnitFromTitle = (title) => {
    const unitMap = {
      'Temperature Trend': '°C',
      'Humidity Trend': '%',
      'Oil Level Trend': '%',
      'Voltage Trend': 'V',
      'Current Trend': 'mA',
      'Power Trend': 'mW',
      'Energy Consumption': 'Wh',
      'Angle Variation': '°'
    };
    return unitMap[title] || '';
  };

  const getChartColorFromTitle = (title) => {
    const colorMap = {
      'Temperature Trend': '#FF6B6B',
      'Humidity Trend': '#4ECDC4',
      'Oil Level Trend': '#FFD166',
      'Voltage Trend': '#6246EA',
      'Current Trend': '#3A86FF',
      'Power Trend': '#F72585',
      'Energy Consumption': '#2EC4B6',
      'Angle Variation': '#9D4EDD'
    };
    return colorMap[title] || '#3A86FF';
  };

  // Helper function for status indication in PDF
  const getStatusIndicator = (value, minNormal, maxNormal) => {
    const numValue = parseFloat(value) || 0;
    if (numValue < minNormal || numValue > maxNormal) {
      return 'Warning';
    }
    return 'Normal';
  };

  // Create a simple chart using SVG as fallback for PDF export
  const createFallbackChart = (title, data, dataKey, color, unit) => {
    if (!data || data.length === 0) return null;
    
    const width = 300;
    const height = 150;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    const values = data.map(d => parseFloat(d[dataKey])).filter(v => !isNaN(v));
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;
    
    // Create SVG path for the line
    let pathData = '';
    values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * chartWidth;
      const y = chartHeight - ((value - minValue) / valueRange) * chartHeight;
      pathData += index === 0 ? `M${x},${y}` : `L${x},${y}`;
    });
    
    return {
      svg: `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="white"/>
        <text x="${width/2}" y="15" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold">${title}</text>
        <g transform="translate(${margin.left},${margin.top})">
          <path d="${pathData}" stroke="${color}" stroke-width="2" fill="none"/>
          <text x="${chartWidth/2}" y="${chartHeight + 25}" text-anchor="middle" font-family="Arial" font-size="10">Time</text>
          <text x="-25" y="${chartHeight/2}" text-anchor="middle" font-family="Arial" font-size="10" transform="rotate(-90, -25, ${chartHeight/2})">${unit}</text>
          <text x="5" y="-5" font-family="Arial" font-size="8">${formatValue(maxValue)} ${unit}</text>
          <text x="5" y="${chartHeight + 10}" font-family="Arial" font-size="8">${formatValue(minValue)} ${unit}</text>
        </g>
      </svg>`,
      width,
      height
    };
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
                <div className="button-group">
                  <button 
                    onClick={fetchGoogleSheetData}
                    className="refresh-button"
                  >
                    Refresh Now
                  </button>
                  <button 
                    onClick={exportToPDF}
                    className="export-button"
                    title="Export complete dashboard report to PDF"
                  >
                    📄 Export PDF
                  </button>
                </div>
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
        <p>Industrial Health Monitoring System • Data updates every 3 minutes</p>
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