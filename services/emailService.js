import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

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

// Send contact email to admin
export const sendContactEmail = async (contactData) => {
  const { name, email, phone, subject, message } = contactData;
  
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.ADMIN_EMAIL, // Use your Gmail as sender
      to: process.env.ADMIN_EMAIL,   // Send to yourself (admin)
      subject: `New Contact Form: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Contact Form Submission</h2>
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
    
    const mailOptions = {
      from: process.env.ADMIN_EMAIL,
      to: email,
      subject: `We've received your message: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Thank You for Contacting Us!</h2>
          <p>Dear <strong>${name}</strong>,</p>
          <p>We have received your message and will get back to you within 24-48 hours.</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p>Best regards,<br>Your Company Team</p>
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