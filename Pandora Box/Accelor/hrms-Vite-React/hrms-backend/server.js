// server.js
import { config } from 'dotenv';
config();
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';

import connectDatabase from './config/modb.js';
import { cleanupDatabase } from './config/modb.js';
import initializeSocket from './config/socker.js';
import initializeScheduledJobs from './config/cron.js';
import registerRoutes from './routes/main.js';
import { corsOptions, allowedOrigins } from './config/cors.js';
import { registerShutdownHandlers } from './config/shutdown.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add health check endpoint
app.get('/health', (req, res) => {
  const { isShuttingDown, getShutdownReason } = req.app.get('shutdownStatus');
  res.json({
    status: isShuttingDown ? 'shutting_down' : 'healthy',
    shutdownReason: getShutdownReason(),
    timestamp: new Date().toISOString()
  });
});

// Initialize components
const startServer = async () => {
  try {
    // Initialize database connection
    const dbConnection = await connectDatabase();
    
    // Initialize scheduled jobs
    const scheduledJobs = initializeScheduledJobs();
    
    // Initialize Socket.IO with CORS configuration
    const io = initializeSocket(server, allowedOrigins);
    
    // Store the cleanup functions in app
    app.set('cleanupFunctions', {
      dbConnection: cleanupDatabase,
      scheduledJobs: () => scheduledJobs.cleanup(),
      socketCleanup: () => {
        if (global._io) {
          global._io.close();
          console.log('Socket.IO server closed');
        }
      }
    });
    
    // Register API routes
    registerRoutes(app);
    console.log('API routes registered');
    
    // Register shutdown handlers
    const shutdownStatus = registerShutdownHandlers(server, io, dbConnection, scheduledJobs);
    app.set('shutdownStatus', shutdownStatus);
    
    // Start the server
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Socket.IO server initialized`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      console.error('Server error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  } 
};

startServer();
