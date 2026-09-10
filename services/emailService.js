import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import Setting from '../models/Setting.js';

dotenv.config();

// Create transporter function for Gmail
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail', // Use Gmail service
    auth: {
      user: process.env.ADMIN_EMAIL, // Your Gmail address
      pass: process.env.ADMIN_PASS,  // Your Gmail app password
    },
  });
};

// Helper: Get dynamic site name from settings
const getSiteName = async () => {
  try {
    const settings = await Setting.findOne().select('siteName');
    return settings?.siteName || 'Your Company';
  } catch (error) {
    console.error('Error fetching site name:', error);
    return 'Your Company';
  }
};

// Send contact email to admin
export const sendContactEmail = async (contactData) => {
  const { name, email, phone, subject, message } = contactData;
  
  try {
    const transporter = createTransporter();
    const siteName = await getSiteName();
    
    const mailOptions = {
      from: process.env.ADMIN_EMAIL, // Use your Gmail as sender
      to: process.env.ADMIN_EMAIL,   // Send to yourself (admin)
      subject: `New Contact Form (${siteName}): ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Contact Form Submission — ${siteName}</h2>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 5px;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong></p>
            <div style="background: white; padding: 15px; border-radius: 3px; margin-top: 10px;">
              ${message.replace(/\n/g, '<br>')}
            </div>
          </div>
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999; text-align: center;">
            © ${new Date().getFullYear()} ${siteName}. All rights reserved.
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Contact email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending contact email:', error);
    throw error;
  }
};

// Send confirmation email to user
export const sendConfirmationEmail = async (contactData) => {
  const { name, email, subject } = contactData;
  
  try {
    const transporter = createTransporter();
    const siteName = await getSiteName();
    
    const mailOptions = {
      from: process.env.ADMIN_EMAIL,
      to: email,
      subject: `We've received your message: ${subject} — ${siteName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Thank You for Contacting ${siteName}!</h2>
          <p>Dear <strong>${name}</strong>,</p>
          <p>We have received your message and will get back to you within 24-48 hours.</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p>Best regards,<br>${siteName} Team</p>
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999; text-align: center;">
            © ${new Date().getFullYear()} ${siteName}. All rights reserved.
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Confirmation email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    throw error;
  }
};