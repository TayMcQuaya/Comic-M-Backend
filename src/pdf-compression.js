// PDF Compression Service using iLovePDF API
// Using dynamic imports to work with CommonJS package
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

class PDFCompressionService {
    constructor() {
        // Get API keys from environment variables
        this.publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
        this.secretKey = process.env.ILOVEPDF_SECRET_KEY;
        
        // Log API key status
        console.log('iLovePDF API Keys:', {
            publicKey: this.publicKey ? 'Set' : 'Not Set',
            secretKey: this.secretKey ? 'Set' : 'Not Set'
        });
    }

    /**
     * Compress a PDF file using iLovePDF API
     * @param {string} inputFilePath - Path to the original PDF file
     * @param {string} outputFilePath - Path where compressed PDF should be saved
     * @returns {Promise<object>} - Compression result with statistics
     */
    async compressPDF(inputFilePath, outputFilePath, options = {}) {
        try {
            console.log('Starting PDF compression task with options:', options);
            
            // Dynamic import for CommonJS packages
            const ILovePDFApi = (await import('@ilovepdf/ilovepdf-nodejs')).default;
            const ILovePDFFile = (await import('@ilovepdf/ilovepdf-nodejs/ILovePDFFile.js')).default;
            
            const instance = new ILovePDFApi(this.publicKey, this.secretKey);
            const task = instance.newTask('compress');
            
            console.log('Task created, starting...');
            await task.start();
            
            console.log('Adding file to compression task:', inputFilePath);
            // Check if input file exists before attempting to add it
            if (!fs.existsSync(inputFilePath)) {
                console.error(`Input file for compression not found: ${inputFilePath}`);
                return {
                    success: false,
                    error: `Input file not found: ${inputFilePath}`,
                    fallback_impossible: true, // Fallback is impossible if input is missing
                    originalSize: 0,
                    compressedSize: 0,
                    compressionRatio: 0
                };
            }
            const file = new ILovePDFFile(inputFilePath);
            const uploadedFile = await task.addFile(file);
            console.log('File added successfully:', uploadedFile);
            
            const processOptions = {
                compression_level: 'recommended', // Default
                ...options // Allow overriding, e.g., from puppeteer-export.js
            };
            console.log('Processing with effective compression options:', processOptions);
            await task.process(processOptions);
            
            console.log('Downloading compressed result...');
            const compressedData = await task.download();
            fs.writeFileSync(outputFilePath, compressedData);
            console.log(`Compressed file successfully saved to ${outputFilePath}`);
            
            // Calculate compression ratio
            const originalSize = fs.statSync(inputFilePath).size;
            const compressedSize = fs.statSync(outputFilePath).size;
            const compressionRatio = originalSize > 0 ? ((originalSize - compressedSize) / originalSize * 100).toFixed(2) : 0;
            
            console.log('Compression complete:', {
                originalSize,
                compressedSize,
                compressionRatio: `${compressionRatio}%`
            });
            
            return {
                success: true,
                originalSize,
                compressedSize,
                compressionRatio
            };
        } catch (error) {
            console.error('Error during PDF compression or initial file handling:', error);
            let originalSize = 0;
            let inputExists = false;

            try {
                if (fs.existsSync(inputFilePath)) {
                    inputExists = true;
                    originalSize = fs.statSync(inputFilePath).size;
                } else {
                    console.warn(`Input file ${inputFilePath} does not exist for compression fallback checking.`);
                }
            } catch (statError) {
                console.error(`Error getting original file size for ${inputFilePath} on compression failure:`, statError);
            }
            
            // Attempt fallback copy only if input file exists
            if (inputExists) {
                try {
                    fs.copyFileSync(inputFilePath, outputFilePath);
                    console.log(`Using original file as fallback at ${outputFilePath} due to compression error: ${error.message}`);
                    return {
                        success: false,
                        error: error.message, // The original compression error
                        fallback_used: true,
                        originalSize: originalSize,
                        compressedSize: originalSize, // Same as original
                        compressionRatio: "0.00" // No compression achieved
                    };
                } catch (copyError) {
                    console.error(`Failed to copy original file ${inputFilePath} as fallback to ${outputFilePath}:`, copyError);
                    return {
                        success: false,
                        error: `Compression API failed: ${error.message}. Fallback copy also failed: ${copyError.message}`,
                        originalSize: originalSize, // Original size if known
                        compressedSize: 0, // Indicate no valid output file
                        compressionRatio: "0.00",
                        fallback_failed: true
                    };
                }
            } else {
                // Input file didn't exist when catch block was entered, so cannot copy for fallback
                console.error(`Input file ${inputFilePath} was not found. Cannot use as fallback.`);
                return {
                    success: false,
                    error: `Compression API failed: ${error.message}. Input file ${inputFilePath} not found, so fallback was impossible.`,
                    originalSize: 0, // No original file to size
                    compressedSize: 0,
                    compressionRatio: "0.00",
                    fallback_impossible: true // Fallback was not possible
                };
            }
        }
    }

    /**
     * Format file size in human-readable format
     * @param {number} bytes - File size in bytes
     * @returns {string} - Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Check if the compression service is properly configured
     * @returns {boolean} - True if API keys are configured
     */
    isAvailable() {
        return !!(this.publicKey && this.secretKey);
    }
}

// Export a singleton instance
const pdfCompressionService = new PDFCompressionService();
export default pdfCompressionService;