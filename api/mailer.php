<?php
/**
 * SMTP Mailer & Notification Dispatcher
 * Secure password recovery & user communication service
 */

require_once __DIR__ . '/config.php';

/**
 * Send an email via SMTP socket or PHP mail() fallback
 *
 * @param string $toEmail
 * @param string $toName
 * @param string $subject
 * @param string $htmlBody
 * @return array ['success' => bool, 'message' => string]
 */
function send_email($toEmail, $toName, $subject, $htmlBody) {
    $host = env('SMTP_HOST', 'smtp.hostinger.com');
    $port = (int)env('SMTP_PORT', 465);
    $user = env('SMTP_USER', '');
    $pass = env('SMTP_PASS', '');
    $fromEmail = env('SMTP_FROM_EMAIL', $user ?: 'notifications@polymerops.com');
    $fromName = env('SMTP_FROM_NAME', 'PVC Pipe Extrusion Suite');

    // If SMTP credentials are configured, try authenticated SMTP delivery
    if (!empty($user) && !empty($pass) && $user !== 'YOUR_SMTP_USER') {
        try {
            $smtpSuccess = send_via_smtp_socket($host, $port, $user, $pass, $fromEmail, $fromName, $toEmail, $toName, $subject, $htmlBody);
            if ($smtpSuccess) {
                return ['success' => true, 'message' => 'Email sent via SMTP successfully'];
            }
        } catch (Throwable $e) {
            error_log('SMTP delivery failed: ' . $e->getMessage() . ' - falling back to mail()');
        }
    }

    // Fallback: Standard PHP mail()
    $headers = [
        'MIME-Version: 1.0',
        'Content-type: text/html; charset=utf-8',
        'From: ' . sprintf('=?UTF-8?B?%s?= <%s>', base64_encode($fromName), $fromEmail),
        'Reply-To: ' . $fromEmail,
        'X-Mailer: PHP/' . phpversion()
    ];

    $mailSent = @mail($toEmail, '=?UTF-8?B?' . base64_encode($subject) . '?=', $htmlBody, implode("\r\n", $headers));
    if ($mailSent) {
        return ['success' => true, 'message' => 'Email sent via mail() fallback'];
    }

    // Log the event for development/offline environments
    error_log(sprintf('Email delivery skipped or failed for %s. Subject: %s', $toEmail, $subject));
    return [
        'success' => false,
        'message' => 'Email dispatch failed. Please ensure SMTP credentials are configured in .env'
    ];
}

/**
 * Native Socket-based SMTP Client (No Composer/PHPMailer dependency required)
 */
function send_via_smtp_socket($host, $port, $user, $pass, $fromEmail, $fromName, $toEmail, $toName, $subject, $htmlBody) {
    $isSsl = ($port === 465);
    $protocol = $isSsl ? 'ssl://' : '';
    $timeout = 10;

    $socket = @fsockopen($protocol . $host, $port, $errno, $errstr, $timeout);
    if (!$socket) {
        throw new Exception("Could not connect to SMTP host $host:$port ($errno: $errstr)");
    }

    $readResponse = function() use ($socket) {
        $response = '';
        while ($line = fgets($socket, 515)) {
            $response .= $line;
            if (substr($line, 3, 1) === ' ') {
                break;
            }
        }
        return $response;
    };

    $sendCommand = function($cmd, $expectedCode = 250) use ($socket, $readResponse) {
        fputs($socket, $cmd . "\r\n");
        $resp = $readResponse();
        $code = (int)substr($resp, 0, 3);
        if ($code !== $expectedCode) {
            throw new Exception("SMTP command failed: $cmd -> $resp");
        }
        return $resp;
    };

    $readResponse(); // Read initial banner

    $sendCommand("EHLO " . gethostname());

    // If port 587, initiate STARTTLS
    if ($port === 587) {
        $sendCommand("STARTTLS", 220);
        stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT);
        $sendCommand("EHLO " . gethostname());
    }

    // Authenticate
    $sendCommand("AUTH LOGIN", 334);
    $sendCommand(base64_encode($user), 334);
    $sendCommand(base64_encode($pass), 235);

    // Envelope
    $sendCommand("MAIL FROM: <$fromEmail>");
    $sendCommand("TO: <$toEmail>");
    $sendCommand("DATA", 354);

    // Message Content
    $boundary = '=_pvc_' . md5(uniqid(time(), true));
    $headers = [
        "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <$fromEmail>",
        "To: =?UTF-8?B?" . base64_encode($toName) . "?= <$toEmail>",
        "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=",
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"$boundary\"",
        "Date: " . date('r'),
        ""
    ];

    $body = [
        "--$boundary",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        strip_tags($htmlBody),
        "",
        "--$boundary",
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        $htmlBody,
        "",
        "--$boundary--",
        "."
    ];

    $payload = implode("\r\n", array_merge($headers, $body));
    fputs($socket, $payload . "\r\n");
    $dataResp = $readResponse();
    $code = (int)substr($dataResp, 0, 3);

    $sendCommand("QUIT", 221);
    fclose($socket);

    return ($code === 250);
}

/**
 * Generate and dispatch Password Recovery Email
 *
 * @param string $recipientEmail
 * @param string $recipientName
 * @param string $resetLink
 * @return array
 */
function send_password_reset_email($recipientEmail, $recipientName, $resetLink) {
    $subject = "Password Reset Request - PVC Pipe Extrusion Suite";
    $appUrl = env('APP_URL', 'https://pipe1.polymerops.com');

    $htmlBody = <<<HTML
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; margin: 0; padding: 24px; color: #f8fafc; }
    .card { max-width: 540px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #064e3b 0%, #0d9488 50%, #047857 100%); padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
    .header p { margin: 6px 0 0; color: #ccfbf1; font-size: 12px; }
    .body { padding: 32px 28px; line-height: 1.6; }
    .greeting { font-size: 15px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
    .text { font-size: 13.5px; color: #cbd5e1; margin-bottom: 24px; }
    .btn-container { text-align: center; margin: 30px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #059669 0%, #0d9488 100%); color: #ffffff !important; padding: 13px 32px; font-size: 14px; font-weight: 700; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.4); }
    .notice { font-size: 11.5px; color: #94a3b8; background: #0f172a; padding: 14px 16px; border-radius: 8px; border-left: 3px solid #0d9488; margin-top: 24px; }
    .footer { text-align: center; padding: 20px; font-size: 11px; color: #64748b; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>PVC PIPE EXTRUSION SUITE</h1>
      <p>Automated Production &amp; OEE Intelligence Platform</p>
    </div>
    <div class="body">
      <div class="greeting">Hello {$recipientName},</div>
      <div class="text">
        We received a request to reset your password for your operational account on <b>PVC Pipe Production Suite</b>.
      </div>
      <div class="btn-container">
        <a href="{$resetLink}" class="btn" target="_blank">Reset Your Password</a>
      </div>
      <div class="text" style="font-size: 12px; word-break: break-all;">
        Or copy and paste this link in your browser:<br>
        <a href="{$resetLink}" style="color: #14b8a6;">{$resetLink}</a>
      </div>
      <div class="notice">
        <b>Security Notice:</b> This password reset link will expire in <b>60 minutes</b>. If you did not request a password reset, please ignore this email or contact your Super Administrator immediately.
      </div>
    </div>
    <div class="footer">
      &copy; 2026 PVC Pipe Production Suite &middot; Automated Factory Operational Security
    </div>
  </div>
</body>
</html>
HTML;

    return send_email($recipientEmail, $recipientName, $subject, $htmlBody);
}
