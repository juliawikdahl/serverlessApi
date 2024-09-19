const { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand, UpdateItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { v4: uuidv4 } = require('uuid');

const dynamoDbClient = new DynamoDBClient({ region: 'eu-north-1' });

module.exports.createBooking = async (event) => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No request body provided' })
      };
    }

    const requestBody = JSON.parse(event.body);

    if (!requestBody.roomType || !requestBody.guestCount || !requestBody.checkInDate || !requestBody.checkOutDate) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing required fields' })
      };
    }

    const bookingId = uuidv4();

    const params = {
      TableName: 'bookings',
      Item: {
        bookingId: { S: bookingId },
        roomType: { S: requestBody.roomType },
        guestCount: { N: String(requestBody.guestCount) },
        checkInDate: { S: requestBody.checkInDate },
        checkOutDate: { S: requestBody.checkOutDate },
        createdAt: { S: new Date().toISOString() }
      }
    };

    const command = new PutItemCommand(params);
    await dynamoDbClient.send(command);

    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'Booking created successfully', bookingId }),
    };
  } catch (error) {
    console.error('Error creating booking:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

module.exports.getBooking = async (event) => {
  try {
    const bookingId = event.pathParameters.id;

    const params = {
      TableName: 'bookings',
      Key: {
        bookingId: { S: bookingId }
      }
    };

    const command = new GetItemCommand(params);
    const result = await dynamoDbClient.send(command);

    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Booking not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result.Item),
    };
  } catch (error) {
    console.error('Error getting booking:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

module.exports.cancelBooking = async (event) => {
  try {
    const bookingId = event.pathParameters.id;

    const params = {
      TableName: 'bookings',
      Key: {
        bookingId: { S: bookingId }
      }
    };

    const command = new DeleteItemCommand(params);
    await dynamoDbClient.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Booking cancelled successfully' }),
    };
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

module.exports.updateBooking = async (event) => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No request body provided' })
      };
    }

    const requestBody = JSON.parse(event.body);
    const bookingId = event.pathParameters.id;

    const params = {
      TableName: 'bookings',
      Key: {
        bookingId: { S: bookingId }
      },
      UpdateExpression: 'SET roomType = :roomType, guestCount = :guestCount, checkInDate = :checkInDate, checkOutDate = :checkOutDate',
      ExpressionAttributeValues: {
        ':roomType': { S: requestBody.roomType },
        ':guestCount': { N: String(requestBody.guestCount) },
        ':checkInDate': { S: requestBody.checkInDate },
        ':checkOutDate': { S: requestBody.checkOutDate }
      },
      ReturnValues: 'ALL_NEW'
    };

    const command = new UpdateItemCommand(params);
    await dynamoDbClient.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Booking updated successfully' }),
    };
  } catch (error) {
    console.error('Error updating booking:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

module.exports.listBookings = async () => {
  try {
    const params = {
      TableName: 'bookings'
    };

    const command = new ScanCommand(params);
    const result = await dynamoDbClient.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify(result.Items),
    };
  } catch (error) {
    console.error('Error listing bookings:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

module.exports.listRooms = async () => {
  try {
    const params = {
      TableName: 'rooms'
    };

    const command = new ScanCommand(params);
    const result = await dynamoDbClient.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify(result.Items),
    };
  } catch (error) {
    console.error('Error listing rooms:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
