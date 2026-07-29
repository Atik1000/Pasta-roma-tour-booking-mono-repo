import type { Queue } from 'bullmq';

import { MailService } from './mail.service';
import type { MailTransport, SendMailOptions } from './mail.types';

const MESSAGE: SendMailOptions = {
  to: 'traveller@example.com',
  subject: 'Your booking is confirmed',
  html: '<p>See you in Rome.</p>',
};

describe('MailService', () => {
  const config = {
    from: 'Pasta Roma Tour <no-reply@pastaromatour.com>',
    smtpUrl: undefined,
    enabled: false,
  };

  function makeTransport(): MailTransport & { send: jest.Mock } {
    return { send: jest.fn().mockResolvedValue(undefined) };
  }

  it('enqueues delivery when a queue is available', async () => {
    const transport = makeTransport();
    const queue = { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue;

    await new MailService(config, transport, queue).send(MESSAGE);

    expect(queue.add).toHaveBeenCalledWith('send', MESSAGE);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('sends inline when queues are disabled', async () => {
    const transport = makeTransport();

    await new MailService(config, transport).send(MESSAGE);

    expect(transport.send).toHaveBeenCalledWith({ ...MESSAGE, from: config.from });
  });

  it('rethrows transport failures so the job can be retried', async () => {
    const transport = makeTransport();
    transport.send.mockRejectedValue(new Error('SMTP unavailable'));
    const service = new MailService(config, transport);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    await expect(service.deliver(MESSAGE)).rejects.toThrow('SMTP unavailable');
  });
});
