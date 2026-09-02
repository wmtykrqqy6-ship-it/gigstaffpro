import React from 'react';
import EventFormModal from './EventFormModal';

// Thin wrapper: AddEventModal and EditEventModal used to be ~90% duplicated
// copies of the same 650+ line form. Shared logic now lives in
// EventFormModal.jsx, distinguished by whether `event` is passed.
export default function EditEventModal(props) {
  return <EventFormModal {...props} />;
}
