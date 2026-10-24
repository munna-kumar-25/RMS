import nodemailer from 'nodemailer';
import env from '../../config/env.js';

const transporter = env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    })
    : null;

export const sendPasswordResetEmail = async (email, name, resetUrl) => {
    if (!transporter || !env.SMTP_FROM) {
        throw new Error('SMTP email service is not configured.');
    }

    await transporter.sendMail({
        from: env.SMTP_FROM,
        to: email,
        subject: 'Reset your RMS administrator password',
        text: `Hello ${name},\n\nUse this link to reset your password. It expires in 15 minutes:\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
        html: `<p>Hello ${name},</p><p>Use the link below to reset your password. It expires in 15 minutes.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`,
    });
};