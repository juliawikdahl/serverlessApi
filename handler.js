const { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand, UpdateItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { v4: uuidv4 } = require('uuid');
const dynamoDbClient = new DynamoDBClient({ region: 'eu-north-1' });

const ROOM_PRICES = {
  'single': 500,
  'double': 1000,
  'suite': 1500
};

const ROOM_CAPACITY = {
  'single': 1,
  'double': 2,
  'suite': 3
};

const isCancellationAllowed = (checkInDate) => {
  const twoDaysBefore = new Date(checkInDate);
  twoDaysBefore.setDate(twoDaysBefore.getDate() - 2);
  return new Date() <= twoDaysBefore;
};

module.exports.createBooking = async (event) => {
  try {
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ message: 'No request body provided' }) };
    }

    const requestBody = JSON.parse(event.body);
    const { roomType, guestCount, checkInDate, checkOutDate } = requestBody;

    if (!roomType || !guestCount || !checkInDate || !checkOutDate) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing required fields' }) };
    }

    if (!ROOM_CAPACITY[roomType] || guestCount !== ROOM_CAPACITY[roomType]) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Invalid room type or guest count' }) };
    }

    // Calculate total price
    const numberOfNights = Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24));
    const totalPrice = ROOM_PRICES[roomType] * numberOfNights;

    const bookingId = uuidv4();
    const params = {
      TableName: 'bookings',
      Item: {
        bookingId: { S: bookingId },
        roomType: { S: roomType },
        guestCount: { N: String(guestCount) },
        checkInDate: { S: checkInDate },
        checkOutDate: { S: checkOutDate },
        createdAt: { S: new Date().toISOString() },
        totalPrice: { N: String(totalPrice) }
      }
    };

    const command = new PutItemCommand(params);
    await dynamoDbClient.send(command);

    // Return the full booking details including totalPrice
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'Booking created successfully',
        bookingId,
        roomType,
        guestCount,
        checkInDate,
        checkOutDate,
        totalPrice
      }),
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
      Key: { bookingId: { S: bookingId } }
    };

    const command = new GetItemCommand(params);
    const result = await dynamoDbClient.send(command);

    if (!result.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Booking not found' }) };
    }

    // Transform DynamoDB item to a more readable format
    const booking = {
      bookingId: result.Item.bookingId ? result.Item.bookingId.S : null,
      roomType: result.Item.roomType ? result.Item.roomType.S : null,
      guestCount: result.Item.guestCount ? Number(result.Item.guestCount.N) : null,
      checkInDate: result.Item.checkInDate ? result.Item.checkInDate.S : null,
      checkOutDate: result.Item.checkOutDate ? result.Item.checkOutDate.S : null,
      createdAt: result.Item.createdAt ? result.Item.createdAt.S : null,
      totalPrice: result.Item.totalPrice ? Number(result.Item.totalPrice.N) : null
    };

    return {
      statusCode: 200,
      body: JSON.stringify(booking)
    };
  } catch (error) {
    console.error('Error getting booking:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};

module.exports.cancelBooking = async (event) => {
  try {
    const bookingId = event.pathParameters.id;

    const getParams = {
      TableName: 'bookings',
      Key: { bookingId: { S: bookingId } }
    };

    const getCommand = new GetItemCommand(getParams);
    const result = await dynamoDbClient.send(getCommand);

    if (!result.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Booking not found' }) };
    }

    const checkInDate = result.Item.checkInDate.S;
    if (!isCancellationAllowed(checkInDate)) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Cancellation not allowed less than 2 days before check-in' }) };
    }

    const deleteParams = {
      TableName: 'bookings',
      Key: { bookingId: { S: bookingId } }
    };

    const deleteCommand = new DeleteItemCommand(deleteParams);
    await dynamoDbClient.send(deleteCommand);

    return { statusCode: 200, body: JSON.stringify({ message: 'Booking cancelled successfully' }) };
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};

module.exports.updateBooking = async (event) => {
  try {
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ message: 'No request body provided' }) };
    }

    const requestBody = JSON.parse(event.body);
    const { roomType, guestCount, checkInDate, checkOutDate } = requestBody;
    const bookingId = event.pathParameters.id;

    if (!roomType || !guestCount || !checkInDate || !checkOutDate) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing required fields' }) };
    }

    if (!ROOM_CAPACITY[roomType] || guestCount !== ROOM_CAPACITY[roomType]) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Invalid room type or guest count' }) };
    }

    // Calculate new total price
    const numberOfNights = Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24));
    const totalPrice = ROOM_PRICES[roomType] * numberOfNights;

    const params = {
      TableName: 'bookings',
      Key: { bookingId: { S: bookingId } },
      UpdateExpression: 'SET roomType = :roomType, guestCount = :guestCount, checkInDate = :checkInDate, checkOutDate = :checkOutDate, totalPrice = :totalPrice',
      ExpressionAttributeValues: {
        ':roomType': { S: roomType },
        ':guestCount': { N: String(guestCount) },
        ':checkInDate': { S: checkInDate },
        ':checkOutDate': { S: checkOutDate },
        ':totalPrice': { N: String(totalPrice) }
      },
      ReturnValues: 'ALL_NEW'
    };

    const command = new UpdateItemCommand(params);
    const result = await dynamoDbClient.send(command);

    // Return the updated booking details
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Booking updated successfully',
        bookingId,
        roomType,
        guestCount,
        checkInDate,
        checkOutDate,
        totalPrice
      })
    };
  } catch (error) {
    console.error('Error updating booking:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};


module.exports.listBookings = async () => {
  try {
    const params = { TableName: 'bookings' };

    const command = new ScanCommand(params);
    const result = await dynamoDbClient.send(command);

    return { statusCode: 200, body: JSON.stringify(result.Items) };
  } catch (error) {
    console.error('Error listing bookings:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};

module.exports.listRooms = async () => {
  try {
    const params = { TableName: 'rooms' };

    const command = new ScanCommand(params);
    const result = await dynamoDbClient.send(command);

    return { statusCode: 200, body: JSON.stringify(result.Items) };
  } catch (error) {
    console.error('Error listing rooms:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};
